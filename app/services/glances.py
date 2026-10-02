import requests
import json
import threading
from datetime import datetime, timezone
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

_api_version_cache: dict = {}
_cache_lock = threading.Lock()


class GlancesClient:
    def __init__(self, host: str, port: int = 61208, timeout: int = 5):
        self.base_url = f"http://{host}:{port}"
        self.timeout = timeout
        self.session = requests.Session()
        self._api_version: Optional[str] = None

    def _detect_api_version(self) -> str:
        cache_key = self.base_url
        with _cache_lock:
            if cache_key in _api_version_cache:
                self._api_version = _api_version_cache[cache_key]
                return self._api_version

        for ver in ("4", "3"):
            try:
                resp = self.session.get(
                    f"{self.base_url}/api/{ver}/version",
                    timeout=3,
                )
                if resp.status_code == 200:
                    self._api_version = ver
                    with _cache_lock:
                        _api_version_cache[cache_key] = ver
                    return ver
            except Exception:
                continue

        self._api_version = "4"
        with _cache_lock:
            _api_version_cache[cache_key] = "4"
        return "4"

    @property
    def api_version(self) -> str:
        if self._api_version is None:
            self._detect_api_version()
        return self._api_version

    def _get(self, endpoint: str) -> Optional[dict]:
        ver = self.api_version
        try:
            resp = self.session.get(
                f"{self.base_url}/api/{ver}/{endpoint}",
                timeout=self.timeout,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None

    def get_system(self) -> Optional[dict]:
        return self._get("system")

    def get_cpu(self) -> Optional[dict]:
        return self._get("cpu")

    def get_memory(self) -> Optional[dict]:
        return self._get("mem")

    @staticmethod
    def _is_virtual_fs(entry: dict) -> bool:
        device = entry.get("device_name", "") or ""
        mnt = entry.get("mnt_point", "") or ""
        if device.startswith("/dev/loop"):
            return True
        if mnt.startswith("/snap/"):
            return True
        if mnt.startswith("/var/lib/snapd/snap/"):
            return True
        if device.startswith("squashfs"):
            return True
        return False

    @staticmethod
    def _filter_fs(data):
        if not data or not isinstance(data, list):
            return data
        return [d for d in data if not GlancesClient._is_virtual_fs(d)]

    def get_disk(self) -> Optional[list]:
        return self._filter_fs(self._get("fs"))

    def get_network(self) -> Optional[list]:
        return self._get("network")

    def get_processlist(self) -> Optional[list]:
        return self._get("processlist")

    def get_load(self) -> Optional[dict]:
        return self._get("load")

    def get_uptime(self) -> Optional[dict]:
        return self._get("uptime")

    def get_alert(self) -> Optional[list]:
        return self._get("alert")

    def get_sensors(self) -> Optional[list]:
        return self._get("sensors")

    def get_gpu(self) -> Optional[list]:
        return self._get("gpu")

    def get_all(self) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        ver = self.api_version

        # Try single /all endpoint first (much faster - 1 request vs 10+)
        try:
            resp = self.session.get(
                f"{self.base_url}/api/{ver}/all",
                timeout=self.timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "timestamp": now,
                    "system": data.get("system"),
                    "cpu": data.get("cpu"),
                    "memory": data.get("mem"),
                    "disk": self._filter_fs(data.get("fs")),
                    "network": data.get("network"),
                    "processlist": data.get("processlist"),
                    "load": data.get("load"),
                    "uptime": data.get("uptime"),
                    "sensors": data.get("sensors"),
                    "gpu": data.get("gpu"),
                }
        except Exception:
            pass

        # Fallback: individual endpoints
        return {
            "timestamp": now,
            "system": self.get_system(),
            "cpu": self.get_cpu(),
            "memory": self.get_memory(),
            "disk": self.get_disk(),
            "network": self.get_network(),
            "processlist": self.get_processlist(),
            "load": self.get_load(),
            "uptime": self.get_uptime(),
            "sensors": self.get_sensors(),
            "gpu": self.get_gpu(),
        }

    def is_alive(self) -> bool:
        ver = self.api_version
        try:
            resp = self.session.get(
                f"{self.base_url}/api/{ver}/version",
                timeout=3,
            )
            return resp.status_code == 200
        except requests.exceptions.ConnectionError:
            return False
        except requests.exceptions.Timeout:
            return False
        except Exception:
            return False


def fetch_machines_parallel(machines: list, max_workers: int = 10) -> list:
    def fetch_one(m):
        client = GlancesClient(m.host, m.port)
        data = client.get_all()
        data["machine"] = {
            "id": m.id, "name": m.name, "host": m.host,
            "icon": m.icon or "mdi:server",
            "description": m.description or "",
            "color": m.color or "",
        }
        alive = client.is_alive()
        data["status"] = "online" if alive else "offline"
        return data

    if not machines:
        return []

    results = [None] * len(machines)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(fetch_one, m): i
            for i, m in enumerate(machines)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                m = machines[idx]
                results[idx] = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "machine": {
                        "id": m.id, "name": m.name, "host": m.host,
                        "icon": m.icon or "mdi:server",
                        "description": m.description or "",
                        "color": m.color or "",
                    },
                    "status": "offline",
                }
    return results
