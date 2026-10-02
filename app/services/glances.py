import requests
import json
import threading
from datetime import datetime, timezone
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

_api_version_cache: dict = {}
_cache_lock = threading.Lock()

API_PREFIX_CANDIDATES = ("4", "3")
PROBE_TIMEOUT = 3


def _health_endpoint(prefix: str) -> str:
    # /api/3/version returns 400 on old Glances 3 servers,
    # so v3 health check uses /api/3/status (returns "Active").
    return "version" if prefix == "4" else "status"


class GlancesClient:
    def __init__(self, host: str, port: int = 61208, timeout: int = 5):
        self.base_url = f"http://{host}:{port}"
        self.timeout = timeout
        self.session = requests.Session()
        self._api_version: Optional[str] = None

    def _request(self, prefix: str, endpoint: str, timeout: int = None):
        """Raw GET to /api/{prefix}/{endpoint}. Returns Response or None."""
        try:
            return self.session.get(
                f"{self.base_url}/api/{prefix}/{endpoint}",
                timeout=timeout or self.timeout,
            )
        except Exception:
            return None

    def _probe_api(self) -> Optional[str]:
        """Detect API version. Returns '4', '3', or None (unreachable).
        - 404 = that version doesn't exist → try next
        - any other response (200, 400...) = version exists
        - no response (timeout) = server unreachable → abort
        Failure is NEVER cached.
        """
        cache_key = self.base_url
        with _cache_lock:
            if cache_key in _api_version_cache:
                return _api_version_cache[cache_key]

        detected = None
        for prefix in API_PREFIX_CANDIDATES:
            resp = self._request(prefix, _health_endpoint(prefix), timeout=PROBE_TIMEOUT)
            if resp is None:
                # Server unreachable — abort, don't try other versions
                return None
            if resp.status_code != 404:
                detected = prefix
                break

        if detected is not None:
            with _cache_lock:
                _api_version_cache[cache_key] = detected
        # On failure (None): do NOT cache, so next call retries
        return detected

    @property
    def api_version(self) -> str:
        if self._api_version is None:
            self._api_version = self._probe_api()
        return self._api_version or "4"

    def _get(self, endpoint: str) -> Optional[dict]:
        ver = self.api_version
        resp = self._request(ver, endpoint)
        if resp is None or resp.status_code != 200:
            return None
        try:
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
    def _normalize_network(data) -> Optional[list]:
        if not data or not isinstance(data, list):
            return data
        normalized = []
        for iface in data:
            n = dict(iface)
            # v3: map rx/tx → bytes_recv/bytes_sent (both are deltas)
            if n.get("bytes_recv") is None and "rx" in n:
                n["bytes_recv"] = n.get("rx") or 0
            if n.get("bytes_sent") is None and "tx" in n:
                n["bytes_sent"] = n.get("tx") or 0
            t = n.get("time_since_update") or 0
            # Calculate rate (B/s)
            if n.get("bytes_recv_rate_per_sec") is not None:
                n["bytes_rate_recv"] = n["bytes_recv_rate_per_sec"]
            elif t > 0 and n.get("bytes_recv") is not None:
                n["bytes_rate_recv"] = n["bytes_recv"] / t
            else:
                n["bytes_rate_recv"] = 0
            if n.get("bytes_sent_rate_per_sec") is not None:
                n["bytes_rate_sent"] = n["bytes_sent_rate_per_sec"]
            elif t > 0 and n.get("bytes_sent") is not None:
                n["bytes_rate_sent"] = n["bytes_sent"] / t
            else:
                n["bytes_rate_sent"] = 0
            normalized.append(n)
        return normalized

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

        # Single /all endpoint — 1 request (v4) or 2 (v3 probe + all)
        resp = self._request(ver, "all")
        if resp is not None:
            if resp.status_code == 404 and ver == "4":
                # Maybe this server is v3 despite earlier probe
                alt = self._request("3", "all")
                if alt is not None and alt.status_code == 200:
                    resp = alt
                    ver = "3"
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    return {
                        "timestamp": now,
                        "system": data.get("system"),
                        "cpu": data.get("cpu"),
                        "memory": data.get("mem"),
                        "disk": self._filter_fs(data.get("fs")),
                        "network": self._normalize_network(data.get("network")),
                        "processlist": data.get("processlist"),
                        "load": data.get("load"),
                        "uptime": data.get("uptime"),
                        "sensors": data.get("sensors"),
                        "gpu": data.get("gpu"),
                    }
                except Exception:
                    pass

        # Server unreachable (timeout/connection refused) → return empty payload
        # Don't fall back to 10 sequential endpoints (would multiply timeout)
        if resp is None:
            return {
                "timestamp": now,
                "system": None, "cpu": None, "memory": None,
                "disk": None, "network": None, "processlist": None,
                "load": None, "uptime": None, "sensors": None, "gpu": None,
            }

        # /all returned non-200 (not timeout) → fallback to individual endpoints
        return {
            "timestamp": now,
            "system": self.get_system(),
            "cpu": self.get_cpu(),
            "memory": self.get_memory(),
            "disk": self.get_disk(),
            "network": self._normalize_network(self.get_network()),
            "processlist": self.get_processlist(),
            "load": self.get_load(),
            "uptime": self.get_uptime(),
            "sensors": self.get_sensors(),
            "gpu": self.get_gpu(),
        }

    def is_alive(self) -> bool:
        prefix = self.api_version
        resp = self._request(prefix, _health_endpoint(prefix), timeout=PROBE_TIMEOUT)
        return resp is not None and resp.status_code == 200


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
            except Exception:
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
