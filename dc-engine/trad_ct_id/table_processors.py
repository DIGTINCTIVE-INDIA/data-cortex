from trad_ct_id.connection_routing import decide_load_strategy
from trad_ct_id.loaders.file_copy_loader import (
    create_landing_table_via_file,
    create_valid_table_via_file
)


def create_landing_table(
    source_cur,
    target_cur,
    source_connection_details,
    target_connection_details,
    source_database_name,
    source_schema,
    source_table,
    target_database_name,
    target_schema,
    target_table_prefix,
    row_identifier_column=None,
    landing_table_name=None
):
    strategy = decide_load_strategy(source_connection_details, target_connection_details)
    source_database_type = source_connection_details["database_type"]
    target_database_type = target_connection_details["database_type"]

    # TODO(later): re-enable when we validate cross-schema correctness per engine.
    # The file+COPY loader below always works; the SQL-only path is an
    # optimization for the same-host case only, and isn't worth switching back
    # on without deliberate per-engine testing.
    # if strategy == "same_host":
    #     create_landing_table_via_sql(
    #         cur=target_cur,
    #         source_database_name=source_database_name,
    #         source_schema=source_schema,
    #         source_table=source_table,
    #         target_database_name=target_database_name,
    #         target_schema=target_schema,
    #         target_table_prefix=target_table_prefix,
    #         database_type=source_database_type
    #     )

    # else:
    #     # Both cross_host and cross_engine use file + COPY
    #     create_landing_table_via_file(
    #         source_cur=source_cur,
    #         target_cur=target_cur,
    #         source_schema=source_schema,
    #         source_table=source_table,
    #         target_schema=target_schema,
    #         target_table_prefix=target_table_prefix,
    #         source_database_type=source_database_type,
    #         target_database_type=target_database_type,
    #         row_identifier_column=row_identifier_column
    #     )


    create_landing_table_via_file(
        source_cur=source_cur,
        target_cur=target_cur,
        source_schema=source_schema,
        source_table=source_table,
        target_schema=target_schema,
        target_table_prefix=target_table_prefix,
        source_database_type=source_database_type,
        target_database_type=target_database_type,
        row_identifier_column=row_identifier_column,
        landing_table_name=landing_table_name
    )



def create_valid_table(
    source_cur,
    target_cur,
    source_connection_details,
    target_connection_details,
    source_database_name,
    source_schema,
    source_table,
    target_database_name,
    target_schema,
    target_table_prefix,
    job_id,
    job_timestamp,
    row_identifier_column,
    failed_row_identifiers
):
    strategy = decide_load_strategy(source_connection_details, target_connection_details)
    source_database_type = source_connection_details["database_type"]
    target_database_type = target_connection_details["database_type"]

    # TODO(later): re-enable when we validate cross-schema correctness per engine.
    # See the matching note in create_landing_table above.
    # if strategy == "same_host":
    #     create_valid_table_via_sql(
    #         cur=target_cur,
    #         source_database_name=source_database_name,
    #         source_schema=source_schema,
    #         source_table=source_table,
    #         target_database_name=target_database_name,
    #         target_schema=target_schema,
    #         target_table_prefix=target_table_prefix,
    #         database_type=source_database_type,
    #         job_id=job_id,
    #         job_timestamp=job_timestamp,
    #         row_identifier_column=row_identifier_column,
    #         failed_row_identifiers=failed_row_identifiers
    #     )

    # else:
    #     # Both cross_host and cross_engine use file + COPY
    #     create_valid_table_via_file(
    #         source_cur=source_cur,
    #         target_cur=target_cur,
    #         source_schema=source_schema,
    #         source_table=source_table,
    #         target_schema=target_schema,
    #         target_table_prefix=target_table_prefix,
    #         source_database_type=source_database_type,
    #         target_database_type=target_database_type,
    #         job_id=job_id,
    #         job_timestamp=job_timestamp,
    #         row_identifier_column=row_identifier_column,
    #         failed_row_identifiers=failed_row_identifiers
    #     )




    create_valid_table_via_file(
    source_cur=source_cur,
    target_cur=target_cur,
    source_schema=source_schema,
    source_table=source_table,
    target_schema=target_schema,
    target_table_prefix=target_table_prefix,
    source_database_type=source_database_type,
    target_database_type=target_database_type,
    job_id=job_id,
    job_timestamp=job_timestamp,
    row_identifier_column=row_identifier_column,
    failed_row_identifiers=failed_row_identifiers
)