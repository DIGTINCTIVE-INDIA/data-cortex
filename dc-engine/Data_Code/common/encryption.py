"""
Password encryption utilities for secure storage.

The Fernet key is an ops-owned secret read from the ``DC_ENCRYPTION_KEY``
environment variable -- the same class of secret as ``RDS_PASSWORD``. This
module never generates a key: generating one on the fly (the old behaviour
when the key file was absent) silently invalidates every password already
stored in the database, which is indistinguishable from data loss until
someone tries to connect.
"""
from cryptography.fernet import Fernet
import os

_ENV_VAR = "DC_ENCRYPTION_KEY"
_cipher = None


def get_encryption_key():
    """
    Return the Fernet key from ``DC_ENCRYPTION_KEY``.

    The environment variable is the only source. There is deliberately no file
    fallback: a stale ``.encryption_key`` left next to this module would be
    picked up silently and decrypt with the wrong key, which does not fail here
    -- it fails much later as ``InvalidToken`` midway through a live job, with
    nothing in the traceback pointing at the key. Failing at startup instead
    makes a misconfigured host obvious.

    Raises:
        RuntimeError: if the env var is not set.
    """
    key = os.environ.get(_ENV_VAR)
    if key:
        return key.strip().encode() if isinstance(key, str) else key

    raise RuntimeError(
        f"{_ENV_VAR} not set -- refusing to start. Set it to the Fernet key "
        "that this deployment's stored passwords were encrypted with -- the "
        "same value as ENCRYPTION_SECRET_KEY in the backend, which is what "
        "encrypted them. A new key is deliberately NOT generated: that would "
        "make every stored password undecryptable."
    )


def _get_cipher():
    """
    Build the Fernet cipher on first use.

    Lazy on purpose -- importing this module must not fail just because the
    key isn't configured, so code paths that never touch a secret (most of
    the test suite) keep working, and the ones that do get the explicit
    error above at the point of use.
    """
    global _cipher
    if _cipher is None:
        _cipher = Fernet(get_encryption_key())
    return _cipher

def encrypt_password(password: str) -> str:
    """Encrypt a password."""
    if not password:
        return ""
    return _get_cipher().encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt a password."""
    if not encrypted_password:
        return ""
    return _get_cipher().decrypt(encrypted_password.encode()).decode()

def encrypt_secret(secret: str) -> str:
    """Encrypt any secret value."""
    return encrypt_password(secret)

def decrypt_secret(encrypted_secret: str) -> str:
    """Decrypt any encrypted secret value."""
    return decrypt_password(encrypted_secret)
