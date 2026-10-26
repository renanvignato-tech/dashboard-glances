from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
from config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer")
    full_name = Column(String(100), default="")
    email = Column(String(100), default="")
    telegram_id = Column(String(50), default="")
    telegram_username = Column(String(50), default="")
    receive_alerts_email = Column(Boolean, default=True)
    receive_alerts_telegram = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Machine(Base):
    __tablename__ = "machines"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True, default="")
    host = Column(String(255), nullable=False)
    port = Column(Integer, default=61208)
    is_local = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    tags = Column(String(500), default="")
    icon = Column(String(50), default="mdi:server")
    description = Column(String(255), default="")
    color = Column(String(20), default="")
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen = Column(DateTime, nullable=True)


class DashboardLayout(Base):
    __tablename__ = "dashboard_layouts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String(100), nullable=False)
    config = Column(Text, default="{}")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DashboardPage(Base):
    __tablename__ = "dashboard_pages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String(100), nullable=False)
    icon = Column(String(50), default="mdi:view-dashboard")
    position = Column(Integer, default=0)
    machine_ids = Column(Text, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class FilterPreset(Base):
    __tablename__ = "filter_presets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    machine_id = Column(Integer, nullable=True)
    filters = Column(Text, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MonitorLog(Base):
    __tablename__ = "monitor_logs"
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, nullable=False, index=True)
    machine_name = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now, index=True)
    cpu_percent = Column(Float, default=0)
    mem_percent = Column(Float, default=0)
    mem_used = Column(Float, default=0)
    mem_total = Column(Float, default=0)
    disk_root_percent = Column(Float, default=0)
    gpu_load = Column(Float, default=0)
    gpu_temp = Column(Float, default=0)
    load_1 = Column(Float, default=0)
    load_5 = Column(Float, default=0)
    load_15 = Column(Float, default=0)
    top_procs = Column(Text, default="[]")
    status = Column(String(20), default="online")
    process_count = Column(Integer, default=0)
    threshold_alert = Column(Boolean, default=False)
    per_user_alert = Column(Text, default="")


class MonitorConfig(Base):
    __tablename__ = "monitor_config"
    id = Column(Integer, primary_key=True, index=True)
    interval_minutes = Column(Integer, default=5)
    enabled = Column(Boolean, default=True)
    retention_months = Column(Integer, default=3)
    collect_cpu = Column(Boolean, default=True)
    collect_mem = Column(Boolean, default=True)
    collect_disk = Column(Boolean, default=True)
    collect_load = Column(Boolean, default=True)
    collect_procs = Column(Boolean, default=True)
    selected_machines = Column(Text, default="[]")
    process_threshold = Column(Integer, default=0)
    per_user_threshold = Column(Integer, default=0)
    per_user_names = Column(Text, default="[]")
    # Alert thresholds
    cpu_threshold = Column(Integer, default=90)
    mem_threshold = Column(Integer, default=90)
    disk_threshold = Column(Integer, default=90)
    gpu_threshold = Column(Integer, default=90)
    # Alert enable/disable
    alert_cpu = Column(Boolean, default=True)
    alert_mem = Column(Boolean, default=True)
    alert_disk = Column(Boolean, default=True)
    alert_gpu = Column(Boolean, default=True)
    alert_process = Column(Boolean, default=True)
    alert_per_user = Column(Boolean, default=True)


class SystemConfig(Base):
    __tablename__ = "system_config"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)


class UserAlertMachine(Base):
    __tablename__ = "user_alert_machines"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    machine_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DiskLabel(Base):
    __tablename__ = "disk_labels"
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, nullable=False, index=True)
    device_name = Column(String(255), nullable=False)
    label = Column(String(100), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    defaults = {
        "smtp_enabled": "false",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": "587",
        "smtp_user": "",
        "smtp_password": "",
        "smtp_from": "",
        "smtp_use_tls": "true",
        "telegram_bot_token": "",
        "telegram_enabled": "false",
        "logo_file": "default.svg",
        "theme": "dark",
        "telegram_allowed_users": "[]",
    }
    for k, v in defaults.items():
        if not db.query(SystemConfig).filter(SystemConfig.key == k).first():
            db.add(SystemConfig(key=k, value=v))
    db.commit()
    db.close()
