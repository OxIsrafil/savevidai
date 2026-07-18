from slowapi import Limiter

from .client_ip import client_ip

limiter = Limiter(key_func=client_ip)
