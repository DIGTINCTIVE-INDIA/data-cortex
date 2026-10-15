"""
Shared constants for values that more than one layer has to agree on.
"""

# Identifies the product's own database (the RDS_* connection) in its one
# internal role: the staging host a file-based job ingests into before the
# checks read it back.
#
# This is an in-memory hint only. It travels through execution_df,
# metadata_map and function arguments for the life of a single job and is
# never written to any table -- DatabaseConnectionManager.get_connection_details
# intercepts it and builds the details dict from the RDS_* env vars instead of
# doing a database lookup. Product DB credentials therefore stay in .env and
# never get encrypted-and-stored inside the very database they grant access to.
#
# Reserved: save/update/delete of user connections reject this as a name or id.
INTERNAL_DB_SENTINEL = "_internal"
