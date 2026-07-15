class AppError(Exception):
    """Domain error rendered as {"error": code, "message": message} with the given HTTP status."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
