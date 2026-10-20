import httpx

GISTS_BASE_URL = "https://api.github.com/gists"


def create_github_client(token: str, transport: httpx.AsyncBaseTransport | None = None):
    return httpx.AsyncClient(
        base_url=GISTS_BASE_URL,
        headers={
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {token}",
        },
        timeout=30,
        transport=transport,
    )


class GistService:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http

    async def _request(self, method: str, url: str, **kwargs):
        res = await self.http.request(method, url, **kwargs)
        res.raise_for_status()
        return res.json() if res.content else None

    async def get_gist(self, gist_id: str) -> dict:
        return await self._request("GET", f"/{gist_id}")

    async def create_gist(self, payload: dict) -> dict:
        return await self._request("POST", "", json=payload)

    async def update_gist(self, gist_id: str, payload: dict) -> dict:
        return await self._request("PATCH", f"/{gist_id}", json=payload)

    async def delete_gist(self, gist_id: str) -> None:
        await self._request("DELETE", f"/{gist_id}")

    async def get_commits(
        self, gist_id: str, per_page: int | None = None, page: int | None = None
    ) -> list[dict]:
        params = {k: v for k, v in {"per_page": per_page, "page": page}.items() if v is not None}
        return await self._request("GET", f"/{gist_id}/commits", params=params)

    async def get_commit(self, gist_id: str, sha: str) -> dict:
        return await self._request("GET", f"/{gist_id}/{sha}")
