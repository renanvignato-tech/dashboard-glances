from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from app.database import get_db, Machine, User, MonitorLog, DiskLabel
from app.auth import get_current_user, require_admin
from app.services.glances import GlancesClient

router = APIRouter(prefix="/api/machines", tags=["machines"])


class MachineCreate(BaseModel):
    name: str = ""
    host: str
    port: int = 61208
    is_local: bool = False
    tags: str = ""
    icon: str = "mdi:server"
    description: str = ""
    color: str = ""


class MachineUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    enabled: Optional[bool] = None
    tags: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None


class MachineReorder(BaseModel):
    ids: List[int]


@router.get("/")
def list_machines(user=Depends(get_current_user), db: Session = Depends(get_db)):
    machines = db.query(Machine).order_by(Machine.position.asc(), Machine.id.asc()).all()
    result = []
    for m in machines:
        client = GlancesClient(m.host, m.port)
        alive = client.is_alive()
        if alive:
            m.last_seen = datetime.now(timezone.utc)
            db.commit()
        result.append({
            "id": m.id, "name": m.name, "host": m.host, "port": m.port,
            "is_local": m.is_local, "enabled": m.enabled, "tags": m.tags,
            "icon": m.icon or "mdi:server",
            "description": m.description or "",
            "color": m.color or "",
            "position": m.position or 0,
            "status": "online" if alive else "offline",
            "last_seen": m.last_seen.isoformat() if m.last_seen else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return result


@router.post("/")
def create_machine(req: MachineCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    name = req.name
    if not name:
        client = GlancesClient(req.host, req.port)
        try:
            sys_info = client.get_system()
            if sys_info and sys_info.get("hostname"):
                name = sys_info["hostname"]
            else:
                name = req.host
        except Exception:
            name = req.host
    machine = Machine(
        name=name, host=req.host, port=req.port, is_local=req.is_local,
        tags=req.tags, icon=req.icon, description=req.description, color=req.color,
    )
    db.add(machine)
    db.commit()
    db.refresh(machine)
    client = GlancesClient(machine.host, machine.port)
    status = "online" if client.is_alive() else "offline"
    return {"id": machine.id, "name": machine.name, "status": status, "message": "Máquina adicionada"}


@router.put("/{machine_id}")
def update_machine(machine_id: int, req: MachineUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    for field, value in req.dict(exclude_unset=True).items():
        setattr(machine, field, value)
    db.commit()
    return {"message": "Máquina atualizada"}


@router.delete("/{machine_id}")
def delete_machine(machine_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    db.delete(machine)
    db.commit()
    return {"message": "Máquina removida"}


@router.post("/reorder")
def reorder_machines(req: MachineReorder, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    for i, machine_id in enumerate(req.ids):
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if machine:
            machine.position = i
    db.commit()
    return {"message": "Ordem atualizada"}


@router.get("/{machine_id}/data")
def get_machine_data(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    data = client.get_all()
    data["machine"] = {
        "id": machine.id, "name": machine.name, "host": machine.host,
        "icon": machine.icon or "mdi:server",
        "description": machine.description or "",
        "color": machine.color or "",
    }
    return data


@router.get("/{machine_id}/detail")
def get_machine_detail(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    alive = client.is_alive()
    if alive:
        machine.last_seen = datetime.now(timezone.utc)
        db.commit()
    data = client.get_all()
    data["machine"] = {
        "id": machine.id, "name": machine.name, "host": machine.host,
        "port": machine.port, "icon": machine.icon or "mdi:server",
        "description": machine.description or "",
        "color": machine.color or "",
        "tags": machine.tags or "",
    }
    data["status"] = "online" if alive else "offline"
    return data


@router.get("/{machine_id}/history")
def get_machine_history(
    machine_id: int,
    hours: int = Query(default=24, ge=1, le=168),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    logs = (
        db.query(MonitorLog)
        .filter(MonitorLog.machine_id == machine_id, MonitorLog.timestamp >= since)
        .order_by(MonitorLog.timestamp.asc())
        .all()
    )
    return {
        "machine_id": machine_id,
        "machine_name": machine.name,
        "hours": hours,
        "points": [
            {
                "timestamp": log.timestamp.isoformat(),
                "cpu": log.cpu_percent,
                "mem": log.mem_percent,
                "disk": log.disk_root_percent,
                "load1": log.load_1,
                "load5": log.load_5,
                "load15": log.load_15,
                "process_count": log.process_count,
            }
            for log in logs
        ],
    }


@router.get("/{machine_id}/cpu")
def get_machine_cpu(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    return client.get_cpu() or {"error": "Não foi possível obter dados"}


@router.get("/{machine_id}/memory")
def get_machine_memory(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    return client.get_memory() or {"error": "Não foi possível obter dados"}


@router.get("/{machine_id}/disk")
def get_machine_disk(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    return client.get_disk() or {"error": "Não foi possível obter dados"}


@router.get("/{machine_id}/processes")
def get_machine_processes(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    return client.get_processlist() or []


@router.get("/{machine_id}/gpu")
def get_machine_gpu(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    client = GlancesClient(machine.host, machine.port)
    return client.get_gpu() or []


@router.post("/test")
def test_connection(req: MachineCreate, user: User = Depends(require_admin)):
    import requests as req_lib
    client = GlancesClient(req.host, req.port)
    try:
        alive = client.is_alive()
        if alive:
            data = client.get_system()
            return {"alive": True, "system": data}
        else:
            return {"alive": False, "error": "Glances não respondeu"}
    except req_lib.exceptions.ConnectionError:
        return {"alive": False, "error": f"Conexão recusada em {req.host}:{req.port}"}
    except req_lib.exceptions.Timeout:
        return {"alive": False, "error": "Timeout - máquina não respondeu em 3s"}
    except Exception as e:
        return {"alive": False, "error": str(e)}


# ============================================================
# DISK LABELS
# ============================================================

class DiskLabelUpdate(BaseModel):
    labels: dict  # {"device_name": "label", ...}


@router.get("/{machine_id}/disk-labels")
def get_disk_labels(machine_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(DiskLabel).filter(DiskLabel.machine_id == machine_id).all()
    return {r.device_name: r.label for r in rows}


@router.put("/{machine_id}/disk-labels")
def set_disk_labels(machine_id: int, req: DiskLabelUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    for device, label in req.labels.items():
        label = (label or "").strip()
        row = db.query(DiskLabel).filter(
            DiskLabel.machine_id == machine_id,
            DiskLabel.device_name == device,
        ).first()
        if label:
            if row:
                row.label = label
            else:
                db.add(DiskLabel(machine_id=machine_id, device_name=device, label=label))
        else:
            if row:
                db.delete(row)
    db.commit()
    return {"message": "Labels atualizados"}
