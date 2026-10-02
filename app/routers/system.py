from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db, SystemConfig, User, UserAlertMachine, Machine
from app.auth import get_current_user, require_admin
import subprocess
import os
from datetime import datetime, timezone

router = APIRouter(prefix="/api/system", tags=["system"])


def get_config_value(db: Session, key: str, default: str = "") -> str:
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return cfg.value if cfg else default


def set_config_value(db: Session, key: str, value: str):
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if cfg:
        cfg.value = value
    else:
        db.add(SystemConfig(key=key, value=value))
    db.commit()


class ConfigUpdate(BaseModel):
    key: str
    value: str


class BulkConfigUpdate(BaseModel):
    configs: dict


@router.get("/config")
def get_all_config(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SystemConfig).all()
    return {r.key: r.value for r in rows}


@router.get("/config/{key}")
def get_config(key: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    val = get_config_value(db, key)
    return {"key": key, "value": val}


@router.put("/config")
def update_config(req: BulkConfigUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    for k, v in req.configs.items():
        set_config_value(db, k, str(v))
    return {"message": "Configurações atualizadas"}


@router.get("/users")
def list_users_full(user=Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{
        "id": u.id, "username": u.username, "role": u.role,
        "full_name": u.full_name, "email": u.email,
        "telegram_id": u.telegram_id, "telegram_username": u.telegram_username,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    telegram_id: Optional[str] = None
    telegram_username: Optional[str] = None


@router.put("/users/{user_id}")
def update_user(user_id: int, req: UserUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if req.full_name is not None:
        target.full_name = req.full_name
    if req.email is not None:
        target.email = req.email
    if req.telegram_id is not None:
        target.telegram_id = req.telegram_id
    if req.telegram_username is not None:
        target.telegram_username = req.telegram_username
    db.commit()
    return {"message": "Usuário atualizado"}


@router.get("/me")
def get_my_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id, "username": user.username, "role": user.role,
        "full_name": user.full_name, "email": user.email,
        "telegram_id": user.telegram_id, "telegram_username": user.telegram_username,
        "receive_alerts_email": user.receive_alerts_email,
        "receive_alerts_telegram": user.receive_alerts_telegram,
    }


class MyProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    telegram_username: Optional[str] = None
    receive_alerts_email: Optional[bool] = None
    receive_alerts_telegram: Optional[bool] = None


@router.put("/me")
def update_my_profile(req: MyProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.full_name is not None:
        user.full_name = req.full_name
    if req.email is not None:
        user.email = req.email
    if req.telegram_username is not None:
        user.telegram_username = req.telegram_username
    if req.receive_alerts_email is not None:
        user.receive_alerts_email = req.receive_alerts_email
    if req.receive_alerts_telegram is not None:
        user.receive_alerts_telegram = req.receive_alerts_telegram
    db.commit()
    return {"message": "Perfil atualizado"}


# ============================================================
# USER ALERT MACHINE PREFERENCES
# ============================================================

@router.get("/me/alert-machines")
def get_my_alert_machines(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(UserAlertMachine).filter(UserAlertMachine.user_id == user.id).all()
    machine_ids = [p.machine_id for p in prefs]
    machines = db.query(Machine).all()
    result = []
    for m in machines:
        result.append({
            "id": m.id,
            "name": m.name or m.host,
            "host": m.host,
            "selected": m.id in machine_ids if machine_ids else True,
        })
    return {"machines": result, "has_preferences": len(machine_ids) > 0}


class AlertMachineUpdate(BaseModel):
    machine_ids: List[int]


@router.put("/me/alert-machines")
def update_my_alert_machines(req: AlertMachineUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(UserAlertMachine).filter(UserAlertMachine.user_id == user.id).delete()
    for mid in req.machine_ids:
        db.add(UserAlertMachine(user_id=user.id, machine_id=mid))
    db.commit()
    return {"message": "Preferências de alerta atualizadas"}


# ============================================================
# DASHBOARD UPDATE
# ============================================================

REPO_DIR = "/var/www/dashboard-glances"


def _run_git(args: list, timeout: int = 30) -> tuple:
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "Timeout"
    except Exception as e:
        return -1, "", str(e)


@router.get("/update/status")
def update_status(user=Depends(require_admin), db: Session = Depends(get_db)):
    code, local_sha, err = _run_git(["rev-parse", "HEAD"])
    if code != 0:
        return {"error": f"Git error: {err}"}

    code2, branch, _ = _run_git(["rev-parse", "--abbrev-ref", "HEAD"])

    last_check = get_config_value(db, "update_last_check", "")
    has_update = get_config_value(db, "update_available", "false") == "true"
    remote_sha = get_config_value(db, "update_remote_sha", "")
    last_apply = get_config_value(db, "update_last_apply", "")

    return {
        "local_sha": local_sha[:12],
        "branch": branch,
        "has_update": has_update,
        "remote_sha": remote_sha[:12] if remote_sha else "",
        "last_check": last_check,
        "last_apply": last_apply,
    }


@router.post("/update/check")
def update_check(user=Depends(require_admin), db: Session = Depends(get_db)):
    code, _, err = _run_git(["fetch", "origin"], timeout=60)
    if code != 0:
        return {"error": f"Fetch failed: {err}", "has_update": False}

    code, local_sha, _ = _run_git(["rev-parse", "HEAD"])
    code2, remote_sha, _ = _run_git(["rev-parse", "origin/main"])

    if code != 0 or code2 != 0:
        return {"error": "Cannot compare SHAs", "has_update": False}

    has_update = local_sha != remote_sha

    now = datetime.now(timezone.utc).isoformat()
    set_config_value(db, "update_last_check", now)
    set_config_value(db, "update_available", "true" if has_update else "false")
    set_config_value(db, "update_remote_sha", remote_sha)

    return {
        "has_update": has_update,
        "local_sha": local_sha[:12],
        "remote_sha": remote_sha[:12],
        "last_check": now,
    }


@router.post("/update/apply")
def update_apply(user=Depends(require_admin), db: Session = Depends(get_db)):
    # Pull latest code (database file is gitignored, won't be touched)
    code, out, err = _run_git(["pull", "origin", "main"], timeout=60)
    if code != 0:
        return {"success": False, "error": f"Git pull failed: {err}"}

    # Check if requirements changed
    req_changed = False
    code2, diff, _ = _run_git(["diff", "HEAD@{1}", "HEAD", "--name-only"], timeout=10)
    if code2 == 0 and "requirements.txt" in diff:
        req_changed = True
        subprocess.run(
            ["/var/www/dashboard-glances/venv/bin/pip", "install", "-r", "requirements.txt"],
            capture_output=True,
            timeout=120,
        )

    # Update last apply time
    now = datetime.now(timezone.utc).isoformat()
    set_config_value(db, "update_last_apply", now)
    set_config_value(db, "update_available", "false")

    # Restart service (uvicorn --reload should auto-reload, but restart to be safe)
    try:
        subprocess.run(
            ["systemctl", "restart", "glances-dashboard.service"],
            capture_output=True,
            timeout=15,
        )
    except Exception:
        pass

    code3, new_sha, _ = _run_git(["rev-parse", "HEAD"])
    return {
        "success": True,
        "new_sha": new_sha[:12] if new_sha else "",
        "requirements_updated": req_changed,
        "message": "Dashboard atualizado com sucesso",
    }
