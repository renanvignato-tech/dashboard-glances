import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db, DashboardLayout, DashboardPage, Machine
from app.auth import get_current_user, require_admin, User
from app.services.glances import GlancesClient, fetch_machines_parallel

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class LayoutSave(BaseModel):
    name: str
    config: str


class PageCreate(BaseModel):
    name: str
    icon: str = "mdi:view-dashboard"
    machine_ids: List[int] = []


class PageUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    machine_ids: Optional[List[int]] = None
    position: Optional[int] = None


@router.get("/all")
def get_all_data(
    page_id: Optional[int] = Query(default=None),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Machine).filter(Machine.enabled == True)

    if page_id is not None:
        page = db.query(DashboardPage).filter(DashboardPage.id == page_id).first()
        if not page:
            raise HTTPException(status_code=404, detail="Página não encontrada")
        try:
            allowed_ids = json.loads(page.machine_ids)
        except Exception:
            allowed_ids = []
        if allowed_ids:
            query = query.filter(Machine.id.in_(allowed_ids))

    machines = query.order_by(Machine.position.asc(), Machine.id.asc()).all()
    result = fetch_machines_parallel(machines)
    return {"machines": result}


@router.get("/overview")
def get_overview(user=Depends(get_current_user), db: Session = Depends(get_db)):
    machines = db.query(Machine).filter(Machine.enabled == True).order_by(Machine.position.asc(), Machine.id.asc()).all()
    overview = {"total": len(machines), "online": 0, "offline": 0, "machines": []}

    def check_machine(m):
        client = GlancesClient(m.host, m.port, timeout=3)
        alive = client.is_alive()
        info = {
            "id": m.id, "name": m.name, "host": m.host,
            "icon": m.icon or "mdi:server",
            "color": m.color or "",
            "status": "online" if alive else "offline",
        }
        if alive:
            cpu = client.get_cpu()
            mem = client.get_memory()
            info["cpu_percent"] = cpu.get("total", 0) if cpu else 0
            info["mem_percent"] = mem.get("percent", 0) if mem else 0
        else:
            info["cpu_percent"] = 0
            info["mem_percent"] = 0
        return info

    from concurrent.futures import ThreadPoolExecutor, as_completed
    results = [None] * len(machines)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(check_machine, m): i for i, m in enumerate(machines)}
        for f in as_completed(futures):
            idx = futures[f]
            try:
                results[idx] = f.result()
            except Exception:
                m = machines[idx]
                results[idx] = {
                    "id": m.id, "name": m.name, "host": m.host,
                    "icon": m.icon or "mdi:server",
                    "color": m.color or "",
                    "status": "offline", "cpu_percent": 0, "mem_percent": 0,
                }

    for info in results:
        if info["status"] == "online":
            overview["online"] += 1
        else:
            overview["offline"] += 1
        overview["machines"].append(info)
    return overview


# ============================================================
# PAGES CRUD
# ============================================================

@router.get("/pages")
def list_pages(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pages = (
        db.query(DashboardPage)
        .filter(DashboardPage.user_id == user.id)
        .order_by(DashboardPage.position.asc(), DashboardPage.id.asc())
        .all()
    )
    return [
        {
            "id": p.id, "name": p.name, "icon": p.icon,
            "position": p.position, "machine_ids": json.loads(p.machine_ids or "[]"),
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in pages
    ]


@router.post("/pages")
def create_page(req: PageCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    max_pos = db.query(DashboardPage).filter(DashboardPage.user_id == user.id).count()
    page = DashboardPage(
        user_id=user.id,
        name=req.name,
        icon=req.icon,
        position=max_pos,
        machine_ids=json.dumps(req.machine_ids),
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return {
        "id": page.id, "name": page.name, "icon": page.icon,
        "position": page.position, "machine_ids": req.machine_ids,
        "message": "Página criada",
    }


@router.put("/pages/{page_id}")
def update_page(page_id: int, req: PageUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    page = db.query(DashboardPage).filter(DashboardPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Página não encontrada")
    if req.name is not None:
        page.name = req.name
    if req.icon is not None:
        page.icon = req.icon
    if req.machine_ids is not None:
        page.machine_ids = json.dumps(req.machine_ids)
    if req.position is not None:
        page.position = req.position
    db.commit()
    return {"message": "Página atualizada"}


@router.delete("/pages/{page_id}")
def delete_page(page_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    page = db.query(DashboardPage).filter(DashboardPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Página não encontrada")
    db.delete(page)
    db.commit()
    return {"message": "Página removida"}


# ============================================================
# LAYOUTS CRUD
# ============================================================

@router.get("/layouts")
def list_layouts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    layouts = db.query(DashboardLayout).filter(
        (DashboardLayout.user_id == user.id) | (DashboardLayout.is_default == True)
    ).all()
    return [{"id": l.id, "name": l.name, "config": l.config, "is_default": l.is_default} for l in layouts]


@router.post("/layouts")
def save_layout(req: LayoutSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(DashboardLayout).filter(
        DashboardLayout.user_id == user.id, DashboardLayout.name == req.name
    ).first()
    if existing:
        existing.config = req.config
        db.commit()
        return {"id": existing.id, "message": "Layout atualizado"}
    custom_count = db.query(DashboardLayout).filter(
        DashboardLayout.user_id == user.id, DashboardLayout.is_default == False
    ).count()
    if custom_count >= 3:
        raise HTTPException(status_code=400, detail="Máximo de 3 layouts personalizados. Exclua um antes de criar outro.")
    layout = DashboardLayout(user_id=user.id, name=req.name, config=req.config)
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return {"id": layout.id, "message": "Layout salvo"}


@router.put("/layouts/{layout_id}")
def update_layout(layout_id: int, req: LayoutSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    layout = db.query(DashboardLayout).filter(DashboardLayout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout não encontrado")
    if layout.is_default:
        raise HTTPException(status_code=400, detail="Não é possível alterar o layout padrão")
    if layout.user_id != user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    if req.name:
        layout.name = req.name
    layout.config = req.config
    db.commit()
    return {"message": "Layout atualizado"}


@router.delete("/layouts/{layout_id}")
def delete_layout(layout_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    layout = db.query(DashboardLayout).filter(DashboardLayout.id == layout_id).first()
    if not layout:
        raise HTTPException(status_code=404, detail="Layout não encontrado")
    if layout.is_default:
        raise HTTPException(status_code=400, detail="Não é possível excluir o layout padrão")
    if layout.user_id != user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    db.delete(layout)
    db.commit()
    return {"message": "Layout removido"}
