from pydantic import BaseModel


class Variant(BaseModel):
    label: str
    width: int | None = None
    height: int | None = None
    url: str
    size_bytes: int | None = None


class MediaItem(BaseModel):
    index: int
    kind: str  # "video" | "gif"
    thumbnail: str | None = None
    duration_seconds: float | None = None
    variants: list[Variant]


class ResolveRequest(BaseModel):
    url: str


class ResolveResponse(BaseModel):
    id: str
    author: str
    handle: str
    avatar_url: str | None = None  # populated from fxtwitter's author.avatar_url; vxtwitter has no avatar
    text: str = ""
    items: list[MediaItem]
