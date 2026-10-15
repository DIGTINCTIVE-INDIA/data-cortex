# init_db.py

import psycopg2
from psycopg2 import sql


DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "postgres",  # connect to default db first
    "user": "postgres",
    "password": "password",
}

TARGET_DB = "datacortex_local"


def create_database():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (TARGET_DB,)
        )

        if cur.fetchone():
            print(f"Database '{TARGET_DB}' already exists")
        else:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(
                sql.Identifier(TARGET_DB)
            ))
            print(f"Database '{TARGET_DB}' created")

    conn.close()


def create_tables():
    config = DB_CONFIG.copy()
    config["database"] = TARGET_DB

    conn = psycopg2.connect(**config)

    with conn.cursor() as cur:

        cur.execute("""
        CREATE TABLE IF NOT EXISTS traditional_checks_library (
            check_id BIGSERIAL PRIMARY KEY,
            check_mapping_name VARCHAR(255) UNIQUE NOT NULL,
            check_name VARCHAR(255) UNIQUE NOT NULL,
            check_description TEXT,
            check_category VARCHAR(255) NOT NULL,
            workstream VARCHAR(255) NOT NULL,
            check_function VARCHAR(255) NOT NULL,
            abort BOOLEAN NOT NULL
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS ml_checks_library (
            check_id BIGSERIAL PRIMARY KEY,
            check_name VARCHAR(255) UNIQUE NOT NULL,
            check_description TEXT,
            check_category VARCHAR(255) NOT NULL,
            workstream VARCHAR(255) NOT NULL,
            check_function VARCHAR(255) NOT NULL,
            abort BOOLEAN NOT NULL
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS database_connection (
            connection_id BIGSERIAL PRIMARY KEY,
            connection_name VARCHAR(255) UNIQUE NOT NULL,
            database_type VARCHAR(100) NOT NULL,
            host VARCHAR(255) NOT NULL,
            port INTEGER NOT NULL,
            database_name VARCHAR(255) NOT NULL,
            username VARCHAR(255) NOT NULL,
            password TEXT NOT NULL,
            db_schema VARCHAR(255) NOT NULL,
            additional_params TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS file_connection (
            connection_id BIGSERIAL PRIMARY KEY,
            connection_name VARCHAR(255) UNIQUE NOT NULL,
            storage_type VARCHAR(100) NOT NULL,
            bucket_or_container_name VARCHAR(255) NOT NULL,
            region VARCHAR(255) NOT NULL,
            access_key_id VARCHAR(255) NOT NULL,
            secret_access_key TEXT NOT NULL,
            endpoint_url TEXT,
            additional_params TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS category_label_library (
            category_id BIGSERIAL PRIMARY KEY,
            category_name VARCHAR(255) UNIQUE NOT NULL,
            category_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            category_description TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS workstream_library (
            workstream_id BIGSERIAL PRIMARY KEY,
            workstream_name VARCHAR(255) UNIQUE NOT NULL,
            workstream_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            workstream_description TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS impacted_downstream_library (
            impacted_downstream_id BIGSERIAL PRIMARY KEY,
            impacted_downstream_name VARCHAR(255) UNIQUE NOT NULL,
            impacted_downstream_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            impacted_downstream_description TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS data_source_library (
            data_source_id BIGSERIAL PRIMARY KEY,
            data_source_name VARCHAR(255) UNIQUE NOT NULL,
            data_source_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            data_source_description TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS public.results (
            check_execution_id BIGSERIAL PRIMARY KEY,
            job_id VARCHAR(255) NOT NULL,
            job_timestamp TIMESTAMP NOT NULL,
            check_id VARCHAR(255) NOT NULL,
            check_name VARCHAR(255) NOT NULL,
            check_description TEXT,
            config_id VARCHAR(255) NOT NULL,
            config_name VARCHAR(255) NOT NULL,
            check_category VARCHAR(255) NOT NULL,
            workstream VARCHAR(255) NOT NULL,
            impacted_downstream VARCHAR(255) ,
            data_source VARCHAR(255) NOT NULL,
            file_or_table_name VARCHAR(255) NOT NULL,
            check_type VARCHAR(255) NOT NULL,
            field VARCHAR(255),
            abort BOOLEAN ,
            check_status VARCHAR(100) ,
            criticality VARCHAR(100),
            issue_rows VARCHAR(255),
            passed_rows VARCHAR(255),
            failure_reason TEXT,
            issue_status VARCHAR(100)
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS custom_business_checks_config (
            check_id BIGSERIAL PRIMARY KEY,
            check_name VARCHAR(255) UNIQUE NOT NULL,
            check_description TEXT,
            check_category VARCHAR(255) NOT NULL,
            workstream VARCHAR(255) NOT NULL,
            impacted_downstream VARCHAR(255) NOT NULL,
            data_source VARCHAR(255) NOT NULL,
            source_connection_id BIGINT,
            target_connection_id BIGINT,
            target_table_prefix VARCHAR(255),
            sql_query TEXT NOT NULL,
            criticality VARCHAR(100),
            error_message TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS file_based_checks_config (
            config_id VARCHAR(10) PRIMARY KEY,
            config_name VARCHAR(200) UNIQUE NOT NULL,
            check_category VARCHAR(200) NOT NULL,
            workstream VARCHAR(200) NOT NULL,
            data_source VARCHAR(200) NOT NULL,
            source_file_type VARCHAR(200) NOT NULL,
            source_file_name VARCHAR(200) NOT NULL,
            impacted_downstream INTEGER[] NOT NULL,
            target_connection_id VARCHAR(100) NOT NULL,
            target_table_prefix VARCHAR(255) NOT NULL,
            landing_table BOOLEAN NOT NULL DEFAULT FALSE,
            landing_table_name VARCHAR(255),
            source_connection_id VARCHAR(100) NOT NULL,
            source_file_delimiter VARCHAR,
            source_file_path VARCHAR
        );
        """)



        cur.execute("""
        CREATE TABLE IF NOT EXISTS traditional_checks_library_rev (
            check_id VARCHAR PRIMARY KEY,
            check_mapping_name VARCHAR NOT NULL UNIQUE,
            check_name VARCHAR NOT NULL UNIQUE,
            check_description TEXT,
            check_category VARCHAR NOT NULL,
            workstream VARCHAR NOT NULL,
            check_function VARCHAR NOT NULL,
            abort BOOLEAN NOT NULL
        );
        """)



        cur.execute("""
        CREATE TABLE IF NOT EXISTS traditional_config_details (
            tc_req_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            config_id VARCHAR(10) NOT NULL,
            field VARCHAR(200) NOT NULL,

            primary_key_check BOOLEAN NOT NULL DEFAULT FALSE,
            primary_key_check_criticality VARCHAR,

            null_check BOOLEAN NOT NULL DEFAULT FALSE,
            null_check_criticality VARCHAR(20),

            length_check BOOLEAN NOT NULL DEFAULT FALSE,
            expected_length INTEGER,
            length_check_criticality VARCHAR(20),

            format_check BOOLEAN NOT NULL DEFAULT FALSE,
            format_regex VARCHAR(500),
            format_check_criticality VARCHAR(20),

            lov_check BOOLEAN NOT NULL DEFAULT FALSE,
            lovs TEXT,
            lov_check_criticality VARCHAR(20),

            duplicate_check BOOLEAN NOT NULL DEFAULT FALSE,
            duplicate_check_criticality VARCHAR(20),

            ri_check BOOLEAN NOT NULL DEFAULT FALSE,
            ri_reference_table VARCHAR(200),
            ri_field_name VARCHAR(200),
            ri_check_criticality VARCHAR,

            column_datatype VARCHAR(255) NOT NULL,
            ri_connection_id VARCHAR,
            column_order INTEGER NOT NULL
        );
        """)




        cur.execute("""
        CREATE TABLE IF NOT EXISTS db_based_checks_config (
            config_id VARCHAR PRIMARY KEY,

            config_name VARCHAR NOT NULL UNIQUE,
            check_category VARCHAR NOT NULL,
            workstream VARCHAR NOT NULL,

            impacted_downstream INTEGER[] NOT NULL,

            data_source VARCHAR NOT NULL,

            source_connection_id VARCHAR NOT NULL,
            source_table_name VARCHAR NOT NULL,

            target_connection_id VARCHAR NOT NULL,
            target_table_prefix VARCHAR NOT NULL,

            landing_table BOOLEAN NOT NULL,
            landing_table_name VARCHAR,

            CONSTRAINT source_connection_fk
                FOREIGN KEY (source_connection_id)
                REFERENCES database_connection(connection_id),

            CONSTRAINT target_connection_fk
                FOREIGN KEY (target_connection_id)
                REFERENCES database_connection(connection_id)
        );
        """)



        conn.commit()

    conn.close()

    print("Tables created successfully")


if __name__ == "__main__":
    create_database()
    create_tables()