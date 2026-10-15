"""
File connector classes for S3, Azure Blob Storage, local files, and SFTP.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional, List, Callable
import os
import re

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    ClientError = Exception

try:
    from azure.storage.blob import BlobServiceClient
    from azure.identity import ClientSecretCredential
except ImportError:
    BlobServiceClient = None
    ClientSecretCredential = None

try:
    import paramiko
except ImportError:
    paramiko = None

import re



class BaseFileConnector(ABC):
    """Base class for all file connectors."""

    def __init__(self, config: Dict[str, Any], log_system_func: Callable, log_validation_func: Callable):
        self.config = config
        self.log_system = log_system_func
        self.log_validation = log_validation_func

    @abstractmethod
    def test_connection(self) -> Tuple[bool, str]:
        """Test the file connection and return success flag and message."""
        return False, "Not Implemented"
    
    @abstractmethod
    @abstractmethod
    def fetch_file(self, file_path: str) -> Tuple[bool, str, Optional[bytes]]:
        """Fetch file content from storage."""
        return False, "Not Implemented", None


class S3Connector(BaseFileConnector):
    """AWS S3 connector."""

    def _client(self):
        if not boto3:
            raise ImportError("boto3 is required for S3 connections. Install with `pip install boto3`.")
        
        access_key_id = self.config.get('access_key_id')
        secret_key = self.config.get('secret_access_key')
        region = self.config.get('region')
        client_config = {
            'aws_access_key_id': access_key_id,
            'aws_secret_access_key': secret_key,
            'region_name': region
        }
        
        endpoint_url = self.config.get('endpoint_url')
        if endpoint_url:
            client_config['endpoint_url'] = endpoint_url
        
        return boto3.client('s3', **client_config)

    def _list_objects(self, prefix: str) -> List[Dict[str, Any]]:
        client = self._client()
        bucket = self.config.get('bucket_or_container_name')
        if not bucket:
            return []

        paginator = client.get_paginator('list_objects_v2')
        objects = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            contents = page.get('Contents') or []
            for item in contents:
                objects.append(item)
        return objects


    def _head_object_key(self, key: str) -> Optional[str]:
        """
        Return `key` if an object with exactly that key exists, else None.

        Any failure -- a 404, a permissions error, a transport problem -- means
        "not a literal hit", so the caller falls through to pattern matching.
        """
        bucket = self.config.get('bucket_or_container_name')
        if not bucket:
            return None
        try:
            self._client().head_object(Bucket=bucket, Key=key)
            return key
        except Exception:
            return None

    def _extract_regex_prefix(self, pattern: str) -> str:
        """Extract the longest safe prefix from a regex pattern for S3 listing."""
        if not pattern:
            return ""
        
        prefix_chars = []
        i = 0
        escaped = False
        
        while i < len(pattern):
            char = pattern[i]
            
            if escaped:
                if char in r'\/.-_':
                    prefix_chars.append(char)
                else:
                    break
                escaped = False
                i += 1
                continue
            
            if char == '\\':
                escaped = True
                i += 1
                continue
            
            if char in r'.*+?[]{}()^$|':
                break
            
            prefix_chars.append(char)
            i += 1
        
        return ''.join(prefix_chars)

    def _resolve_pattern_key(self, pattern: str) -> str:
        """
        Resolve a configured file name to a full S3 key.

        A literal key wins: it's checked with head_object first, and only if
        that 404s is the value treated as a regex. Otherwise a real filename
        that happens to contain regex metacharacters -- ``[2026-Q3].csv``, say
        -- is read as a character class and never resolves, even though the
        object is sitting right there.

        When the value is a pattern and several keys match, the most recently
        modified one is returned.
        """
        if not pattern:
            raise ValueError("Pattern cannot be empty")

        literal_key = self._head_object_key(pattern)
        if literal_key:
            return literal_key

        try:
            regex = re.compile(pattern)
        except re.error as e:
            raise ValueError(f"Invalid regex pattern: {e}")

        prefix = self._extract_regex_prefix(pattern)
        
        objects = self._list_objects(prefix)
        
        if not objects:
            raise FileNotFoundError(f"No objects found with prefix: {prefix}")
        
        matching_objects = []
        for obj in objects:
            key = obj.get('Key', '')
            if regex.fullmatch(key):
                # print(f"Object {key} matches pattern {pattern}")
                matching_objects.append(obj)
        
        if not matching_objects:
            raise FileNotFoundError(f"No objects match pattern: {pattern}")
        
        latest_object = max(matching_objects, key=lambda x: x.get('LastModified', ''))
        
        return latest_object['Key']






    def test_connection(self) -> Tuple[bool, str]:
        bucket = self.config.get('bucket_or_container_name')
        if not bucket:
            self.log_system("S3_MISSING_BUCKET", "ERROR", "Bucket name is required for S3 connection")
            return False, "Bucket name is required for S3 connection"

        try:
            client = self._client()
            client.head_bucket(Bucket=bucket)
            self.log_system("S3_CONN_SUCCESS", "INFO", f"Connected to S3 bucket '{bucket}'")
            return True, f"Connected to S3 bucket '{bucket}'"
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_msg = e.response.get('Error', {}).get('Message', str(e))
            self.log_system("S3_CONN_FAIL", "ERROR", f"S3 connection failed ({error_code}): {error_msg}")
            return False, f"S3 connection failed ({error_code}): {error_msg}"
        except Exception as e:
            self.log_system("S3_CONN_ERROR", "ERROR", f"S3 connection failed: {str(e)}")
            return False, f"S3 connection failed: {str(e)}"
    
    def fetch_file(self, file_path: str) -> Tuple[bool, str, Optional[bytes]]:
        # Ensure file_path is relative for S3 key
        file_path = file_path.lstrip('/')
        bucket = self.config.get('bucket_or_container_name')
        if not bucket:
            return False, "Bucket name is required for S3 connection", None

        try:


            client = self._client()
            response = client.get_object(Bucket=bucket, Key=file_path)
            content = response['Body'].read()
            self.log_system("S3_FETCH_SUCCESS", "INFO", f"Successfully fetched file '{file_path}' from S3")
            return True, f"Successfully fetched file '{file_path}' from S3", content
        except FileNotFoundError as fnf:
            self.log_system("S3_FETCH_NOT_FOUND", "ERROR", str(fnf))
            return False, str(fnf), None
        except Exception as e:
            self.log_system("S3_FETCH_ERROR", "ERROR", f"Error fetching file from S3: {str(e)}")
            return False, f"Error fetching file from S3: {str(e)}", None


class AzureBlobConnector(BaseFileConnector):
    """Azure Blob Storage connector."""

    def _service_client(self) -> BlobServiceClient:
        if not BlobServiceClient:
            raise ImportError("azure-storage-blob and azure-identity are required for Azure connections.")
        
        account_name = self.config.get('account_name')
        tenant_id = self.config.get('tenant_id')
        client_id = self.config.get('client_id')
        client_secret = self.config.get('client_secret')

        if not all([account_name, tenant_id, client_id, client_secret]):
            raise ValueError("Azure connection requires account_name, tenant_id, client_id, and client_secret")

        credential = ClientSecretCredential(tenant_id=tenant_id, client_id=client_id, client_secret=client_secret)
        account_url = self.config.get('account_url') or f"https://{account_name}.blob.core.windows.net"
        return BlobServiceClient(account_url=account_url, credential=credential)

    def test_connection(self) -> Tuple[bool, str]:
        container = self.config.get('bucket_or_container_name')
        if not container:
            return False, "Container name is required for Azure Blob connection"

        try:
            service_client = self._service_client()
            container_client = service_client.get_container_client(container)
            if container_client.exists():
                self.log_system("AZURE_CONN_SUCCESS", "INFO", f"Connected to Azure container '{container}'")
                return True, f"Connected to Azure container '{container}'"
            
            self.log_system("AZURE_CONN_FAIL", "ERROR", f"Azure container '{container}' not found or inaccessible")
            return False, f"Azure container '{container}' not found or inaccessible"
        except Exception as e:
            self.log_system("AZURE_CONN_ERROR", "ERROR", f"Azure Blob connection failed: {str(e)}")
            return False, f"Azure Blob connection failed: {str(e)}"
    
    def fetch_file(self, file_path: str) -> Tuple[bool, str, Optional[bytes]]:
        # Ensure file_path is relative for Azure blob path
        file_path = file_path.lstrip('/')
        container = self.config.get('bucket_or_container_name')
        if not container:
            return False, "Container name is required for Azure Blob connection", None
        
        try:
            service_client = self._service_client()
            container_client = service_client.get_container_client(container)
            blob_client = container_client.get_blob_client(file_path)
            if not blob_client.exists():
                self.log_system("AZURE_FILE_NOT_FOUND", "ERROR", f"File '{file_path}' not found in Azure container '{container}'")
                return False, f"File '{file_path}' not found in Azure container '{container}'", None
            
            download_stream = blob_client.download_blob()
            content = download_stream.readall()
            self.log_system("AZURE_FETCH_SUCCESS", "INFO", f"Successfully fetched file '{file_path}' from Azure")
            return True, f"Successfully fetched file '{file_path}' from Azure", content
        except Exception as e:
            self.log_system("AZURE_FETCH_ERROR", "ERROR", f"Error fetching file from Azure: {str(e)}")
            return False, f"Error fetching file from Azure: {str(e)}", None


class LocalStorageConnector(BaseFileConnector):
    """Local filesystem connector."""

    def test_connection(self) -> Tuple[bool, str]:
        path = self.config.get('path')
        if not path:
            return False, "Local storage requires a path"
        if os.path.exists(path):
            self.log_system("LOCAL_CONN_SUCCESS", "INFO", f"Local path accessible: {path}")
            return True, f"Local path accessible: {path}"
        
        self.log_system("LOCAL_CONN_FAIL", "ERROR", f"Local path does not exist: {path}")
        return False, f"Local path does not exist: {path}"
    
    def fetch_file(self, file_path: str) -> Tuple[bool, str, Optional[bytes]]:
        # Ensure file_path is treated as relative
        file_path = file_path.lstrip('/')
        base_path = self.config.get('path')
        if not base_path:
            return False, "Local storage requires a base path", None
        
        if os.path.isdir(base_path):
            full_path = os.path.join(base_path, file_path)
        else:
            # If base_path is a file and matches, or treat as dir
            if os.path.basename(base_path) == file_path:
                full_path = base_path
            else:
                full_path = os.path.join(os.path.dirname(base_path) or '.', file_path)
        
        try:
            if not os.path.exists(full_path):
                self.log_system("LOCAL_FILE_NOT_FOUND", "ERROR", f"File '{full_path}' does not exist")
                return False, f"File '{full_path}' does not exist", None
            with open(full_path, 'rb') as f:
                content = f.read()
            self.log_system("LOCAL_FETCH_SUCCESS", "INFO", f"Successfully fetched file '{full_path}'")
            return True, f"Successfully fetched file '{full_path}'", content
        except Exception as e:
            self.log_system("LOCAL_FETCH_ERROR", "ERROR", f"Error reading file from local storage: {str(e)}")
            return False, f"Error reading file from local storage: {str(e)}", None


class SFTPConnector(BaseFileConnector):
    """SFTP connector."""

    def test_connection(self) -> Tuple[bool, str]:
        if not paramiko:
            return False, "paramiko is required for SFTP connections."
        host = self.config.get('host')
        port = int(self.config.get('port', 22))
        username = self.config.get('username')
        password = self.config.get('password')
        remote_path = self.config.get('remote_path', '.')

        if not all([host, username, password]):
            return False, "SFTP requires host, username, and password"

        transport = None
        sftp_client = None
        try:
            transport = paramiko.Transport((host, port))
            transport.connect(username=username, password=password)
            sftp_client = paramiko.SFTPClient.from_transport(transport)
            sftp_client.listdir(remote_path)
            self.log_system("SFTP_CONN_SUCCESS", "INFO", f"SFTP connection successful to {host}")
            return True, f"SFTP connection successful to {host}"
        except Exception as e:
            self.log_system("SFTP_CONN_ERROR", "ERROR", f"SFTP connection failed: {str(e)}")
            return False, f"SFTP connection failed: {str(e)}"
        finally:
            if sftp_client: sftp_client.close()
            if transport: transport.close()
    
    def fetch_file(self, file_path: str) -> Tuple[bool, str, Optional[bytes]]:
        # Ensure file_path is relative
        file_path = file_path.lstrip('/')
        if not paramiko:
            return False, "paramiko is required for SFTP connections.", None
        host = self.config.get('host')
        port = int(self.config.get('port', 22))
        username = self.config.get('username')
        password = self.config.get('password')
        remote_path = self.config.get('remote_path', '.')
        
        transport = None
        sftp_client = None
        
        try:
            transport = paramiko.Transport((host, port))
            transport.connect(username=username, password=password)
            sftp_client = paramiko.SFTPClient.from_transport(transport)
            
            full_remote_path = f"{remote_path.rstrip('/')}/{file_path.lstrip('/')}" if remote_path and remote_path != '.' else file_path
            with sftp_client.open(full_remote_path, 'rb') as remote_file:
                content = remote_file.read()
            self.log_system("SFTP_FETCH_SUCCESS", "INFO", f"Successfully fetched file '{full_remote_path}' from SFTP")
            return True, f"Successfully fetched file '{full_remote_path}' from SFTP", content
        except Exception as e:
            self.log_system("SFTP_FETCH_ERROR", "ERROR", f"Error fetching file from SFTP: {str(e)}")
            return False, f"Error fetching file from SFTP: {str(e)}", None,
        finally:
            if sftp_client: sftp_client.close()
            if transport: transport.close()


def get_file_connector(connector_type: str, config: Dict[str, Any], log_system_func: Callable, log_validation_func: Callable) -> BaseFileConnector:
    """
    Factory to retrieve a file connector instance.

    's3' is the one storage type the product stores. It previously wrote
    'aws-s3' while this factory only knew 's3', so EVERY file-based check failed
    with "Unsupported connector type" before it ever reached the file. Both
    sides now say 's3'; 'aws-s3' is still accepted so connections created before
    that change keep working without a data migration.

    The other connectors below are reachable only if something writes their name
    directly -- the product does not offer them.
    """
    connectors = {
        's3': S3Connector,
        'azure_blob': AzureBlobConnector,
        'local': LocalStorageConnector,
        'sftp': SFTPConnector
    }

    # Legacy spellings. 'aws-s3' and 'aws s3' normalise to 'aws_s3' first.
    aliases = {
        'aws_s3': 's3',
        'awss3': 's3',
    }

    ctype = str(connector_type or "").strip().lower().replace('-', '_').replace(' ', '_')
    ctype = aliases.get(ctype, ctype)

    if ctype not in connectors:
        raise ValueError(
            f"Unsupported connector type: {connector_type}. Supported: {', '.join(sorted(connectors))}."
        )

    return connectors[ctype](config, log_system_func, log_validation_func)
