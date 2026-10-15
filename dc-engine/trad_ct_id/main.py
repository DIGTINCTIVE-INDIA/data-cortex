from datetime import datetime, timezone
import uuid
import os
from trad_ct_id.checks_executor import ChecksExecutor
from trad_ct_id.db_connection import get_connection_details
import pandas as pd
from sqlalchemy import create_engine
from trad_ct_id.config import DATABASE_URL


checks_execution_df = pd.read_csv(r"C:\Users\parth.kasat\Downloads\execution_df_snowflake.csv")

# Ingesting job results dataframe into postgres
def store_job_df(job_df):

    print("DATABASE_URL:", DATABASE_URL)
    ENGINE = create_engine(DATABASE_URL)
    
    job_df.to_sql(
        name="results",
        con=ENGINE,
        schema="public",
        if_exists="append",
        index=False
    )


def main(checks_execution_df, job_id, job_timestamp):
    # Fetch all connection_ids required for the job
    source_ids = checks_execution_df["source_connection_id"].unique()
    target_ids = checks_execution_df["target_connection_id"].unique()

    connection_ids = list(set(source_ids).union(set(target_ids)))
    # Fetch details for every connection
    metadata_map = {
        cid: get_connection_details(cid)
        for cid in connection_ids
    }

    print(metadata_map)
    
    
    missing_ids = [
        cid for cid in connection_ids if cid not in metadata_map
    ]

    if missing_ids:
        raise RuntimeError(f"Missing schema mapping for: {missing_ids}")

    # Create object for Class ChecksEcecutor
    executor = ChecksExecutor(
        checks_execution_df,
        job_id=job_id,
        job_timestamp=job_timestamp,
        metadata_map=metadata_map 
    )
    # Execution starts
    job_df, job_status = executor.execute()

    print(job_status)
    store_job_df(job_df)

    return job_df, job_status

# Start 
if __name__ == "__main__":

    job_id = f"JOB_{uuid.uuid4()}"
    job_timestamp = datetime.now(timezone.utc)

    main(checks_execution_df, job_id, job_timestamp)
    
    
    
    