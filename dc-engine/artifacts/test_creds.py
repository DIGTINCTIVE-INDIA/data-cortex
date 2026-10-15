import psycopg2

try:
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        database="datacortex_local",
        user="postgres",
        password="password",
        connect_timeout=5,
    )

    conn.close()
    print("✅ Connection successful")

except Exception as e:
    print(f"❌ Connection failed: {e}")