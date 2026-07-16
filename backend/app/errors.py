class AppError(Exception):
    """Domain error rendered as {"error": code, "message": message} with the given HTTP status."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


INVALID_URL = ("invalid_url", "That doesn't look like a Twitter/X post link.", 422)
NOT_FOUND = ("not_found", "This post doesn't exist or was deleted.", 404)
NO_VIDEO = (
    "no_video",
    "This post has no video. If the video is in a quoted post, paste that post's link.",
    422,
)
PRIVATE = (
    "private_or_restricted",
    "This post is private or age-restricted. SaveVid AI only works with public posts.",
    403,
)
UPSTREAM = ("upstream_error", "Extraction failed. If this keeps happening, report it on GitHub.", 502)


def app_error(spec: tuple[str, str, int]) -> AppError:
    return AppError(*spec)
