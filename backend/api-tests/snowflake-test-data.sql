-- Test data for the Snowflake side of the API tests. Not the same data as the Postgres demo:
-- this is a small customer/order set with a few planted problems in each column, so every kind
-- of check has something to find.
--
-- Run it once in a Snowflake worksheet. Set the database first, then it creates two tables in
-- the AA schema (the SOURCE). The BB schema is left empty: it is where the checks write their
-- results (the _err and _valid tables).
--
--   USE DATABASE <the database that holds the DATACORTEX_TESTING_CLIENT_* schemas>;

CREATE SCHEMA IF NOT EXISTS DATACORTEX_TESTING_CLIENT_AA;
CREATE SCHEMA IF NOT EXISTS DATACORTEX_TESTING_CLIENT_BB;
USE SCHEMA DATACORTEX_TESTING_CLIENT_AA;

-- ---------------------------------------------------------------- CUSTOMERS (20 rows)
CREATE OR REPLACE TABLE CUSTOMERS (
    CUSTOMER_ID   NUMBER(10,0),
    FULL_NAME     VARCHAR(100),
    EMAIL         VARCHAR(150),
    COUNTRY       VARCHAR(3),
    DATE_OF_BIRTH DATE,
    AGE           NUMBER(3,0),
    SIGNUP_DATE   DATE,
    STATUS        VARCHAR(20)
);

-- AGE is filled from DATE_OF_BIRTH with the same DATEDIFF the custom checks use, then a few rows are broken on purpose.
INSERT INTO CUSTOMERS (CUSTOMER_ID, FULL_NAME, EMAIL, COUNTRY, DATE_OF_BIRTH, SIGNUP_DATE, STATUS)
SELECT * FROM VALUES
    (1,  'Aarav Mehta',     'aarav.mehta@example.com',  'IN', DATEADD(year, -34, CURRENT_DATE()), DATEADD(day, -400, CURRENT_DATE()), 'ACTIVE'),
    (2,  'Beth Carter',     'beth.carter@example.com',  'US', DATEADD(year, -41, CURRENT_DATE()), DATEADD(day, -380, CURRENT_DATE()), 'ACTIVE'),
    (3,  'Chen Wei',        'chen.wei@example.com',     'GB', DATEADD(year, -29, CURRENT_DATE()), DATEADD(day, -350, CURRENT_DATE()), 'TRIAL'),
    (4,  'Diana Rossi',     'diana.rossi@example.com',  'DE', DATEADD(year, -52, CURRENT_DATE()), DATEADD(day, -300, CURRENT_DATE()), 'ACTIVE'),
    (5,  'Emil Novak',      'emil.novak@example.com',   'FR', DATEADD(year, -38, CURRENT_DATE()), DATEADD(day, -290, CURRENT_DATE()), 'CLOSED'),
    (6,  'Farah Khan',      'farah.khan@example.com',   'IN', DATEADD(year, -26, CURRENT_DATE()), DATEADD(day, -250, CURRENT_DATE()), 'ACTIVE'),
    (7,  'Gabriel Silva',   'gabriel.silva@example.com','US', DATEADD(year, -45, CURRENT_DATE()), DATEADD(day, -240, CURRENT_DATE()), 'ACTIVE'),
    (7,  'Gabriel Silva',   'gabriel.s@example.com',    'US', DATEADD(year, -45, CURRENT_DATE()), DATEADD(day, -239, CURRENT_DATE()), 'ACTIVE'),   -- duplicate CUSTOMER_ID
    (9,  'Hana Suzuki',     NULL,                       'GB', DATEADD(year, -31, CURRENT_DATE()), DATEADD(day, -200, CURRENT_DATE()), 'ACTIVE'),   -- missing email
    (10, 'Ivan Petrov',     NULL,                       'DE', DATEADD(year, -57, CURRENT_DATE()), DATEADD(day, -190, CURRENT_DATE()), 'TRIAL'),    -- missing email
    (11, 'Julia Santos',    'julia.santos@@example.com','FR', DATEADD(year, -36, CURRENT_DATE()), DATEADD(day, -180, CURRENT_DATE()), 'ACTIVE'),   -- badly formed email
    (12, 'Kofi Mensah',     'not-an-email',             'IN', DATEADD(year, -28, CURRENT_DATE()), DATEADD(day, -170, CURRENT_DATE()), 'ACTIVE'),   -- badly formed email
    (13, 'Lena Fischer',    'lena.fischer@example.com', 'XX', DATEADD(year, -33, CURRENT_DATE()), DATEADD(day, -160, CURRENT_DATE()), 'ACTIVE'),   -- country not in the list
    (14, 'Mateo Garcia',    'mateo.garcia@example.com', 'USA',DATEADD(year, -40, CURRENT_DATE()), DATEADD(day, -150, CURRENT_DATE()), 'ACTIVE'),   -- country too long
    (15, 'Nora Lindgren',   'nora.lindgren@example.com','US', DATEADD(year, -47, CURRENT_DATE()), DATEADD(day, -140, CURRENT_DATE()), 'PENDING??'),-- status not in the list
    (16, 'Omar Haddad',     'omar.haddad@example.com',  'GB', DATEADD(year, -23, CURRENT_DATE()), DATEADD(day, -130, CURRENT_DATE()), 'ACTIVE'),
    (17, 'Priya Nair',      'priya.nair@example.com',   'IN', DATEADD(year, -16, CURRENT_DATE()), DATEADD(day, -120, CURRENT_DATE()), 'ACTIVE'),   -- under 18 (see the custom check)
    (18, 'Quinn Murphy',    'quinn.murphy@example.com', 'US', DATEADD(year, -39, CURRENT_DATE()), DATEADD(day, -110, CURRENT_DATE()), 'ACTIVE'),
    (19, 'Rahul Verma',     'rahul.verma@example.com',  'IN', DATEADD(year, -44, CURRENT_DATE()), DATEADD(day, -100, CURRENT_DATE()), 'ACTIVE'),
    (20, 'Sofia Alvarez',   'sofia.alvarez@example.com','DE', DATEADD(year, -35, CURRENT_DATE()), DATEADD(day, -90,  CURRENT_DATE()), 'ACTIVE')
  AS v(CUSTOMER_ID, FULL_NAME, EMAIL, COUNTRY, DATE_OF_BIRTH, SIGNUP_DATE, STATUS);

UPDATE CUSTOMERS SET AGE = DATEDIFF('year', DATE_OF_BIRTH, CURRENT_DATE());
UPDATE CUSTOMERS SET AGE = AGE + 7 WHERE CUSTOMER_ID IN (4, 12, 19);   -- AGE no longer matches DATE_OF_BIRTH

-- ---------------------------------------------------------------- ORDERS (20 rows)
CREATE OR REPLACE TABLE ORDERS (
    ORDER_ID     NUMBER(10,0),
    CUSTOMER_ID  NUMBER(10,0),
    ORDER_DATE   DATE,
    QUANTITY     NUMBER(10,0),
    UNIT_PRICE   NUMBER(10,2),
    TOTAL_AMOUNT NUMBER(12,2),
    STATUS       VARCHAR(20)
);

INSERT INTO ORDERS (ORDER_ID, CUSTOMER_ID, ORDER_DATE, QUANTITY, UNIT_PRICE, STATUS)
SELECT * FROM VALUES
    (1001, 1,   DATEADD(day, -60, CURRENT_DATE()), 2,  25.00, 'SHIPPED'),
    (1002, 2,   DATEADD(day, -58, CURRENT_DATE()), 1,  99.50, 'SHIPPED'),
    (1003, 3,   DATEADD(day, -55, CURRENT_DATE()), 5,  12.40, 'SHIPPED'),
    (1004, 4,   DATEADD(day, -50, CURRENT_DATE()), 3,  40.00, 'DELIVERED'),
    (1005, 5,   DATEADD(day, -48, CURRENT_DATE()), 1, 250.00, 'DELIVERED'),
    (1005, 5,   DATEADD(day, -47, CURRENT_DATE()), 1, 250.00, 'DELIVERED'),   -- duplicate ORDER_ID
    (1007, 6,   DATEADD(day, -45, CURRENT_DATE()), 4,  18.75, 'SHIPPED'),
    (1008, 999, DATEADD(day, -44, CURRENT_DATE()), 2,  30.00, 'SHIPPED'),     -- customer 999 does not exist
    (1009, 7,   DATEADD(day, -40, CURRENT_DATE()), 6,   9.99, 'DELIVERED'),
    (1010, 8,   DATEADD(day, -39, CURRENT_DATE()), 2,  75.00, 'SHIPPED'),     -- customer 8 does not exist either
    (1011, 9,   DATEADD(day, -35, CURRENT_DATE()), 0,  15.00, 'CANCELLED'),   -- quantity not above zero
    (1012, 10,  DATEADD(day, -33, CURRENT_DATE()), -2, 22.00, 'SHIPPED'),     -- negative quantity
    (1013, 11,  DATEADD(day, -30, CURRENT_DATE()), 3,  NULL,  'SHIPPED'),     -- missing unit price
    (1014, 12,  DATEADD(day, -28, CURRENT_DATE()), 2,  60.00, 'SHIPPED'),
    (1015, 13,  DATEADD(day, -25, CURRENT_DATE()), 1, 120.00, 'DELIVERED'),
    (1016, 14,  DATEADD(day, -20, CURRENT_DATE()), 5,  14.00, 'SHIPPED'),
    (1017, 15,  DATEADD(day, 15,  CURRENT_DATE()), 2,  45.00, 'SHIPPED'),     -- order dated in the future
    (1018, 16,  DATEADD(day, 30,  CURRENT_DATE()), 1,  80.00, 'SHIPPED'),     -- order dated in the future
    (1019, 17,  DATEADD(day, -10, CURRENT_DATE()), 7,  11.00, 'REFUNDED??'),  -- status not in the list
    (1020, 18,  DATEADD(day, -5,  CURRENT_DATE()), 2,  55.00, 'SHIPPED')
  AS v(ORDER_ID, CUSTOMER_ID, ORDER_DATE, QUANTITY, UNIT_PRICE, STATUS);

UPDATE ORDERS SET TOTAL_AMOUNT = QUANTITY * UNIT_PRICE;
UPDATE ORDERS SET TOTAL_AMOUNT = TOTAL_AMOUNT + 10 WHERE ORDER_ID IN (1003, 1009, 1016);   -- total no longer equals quantity x price

-- A quick look (rows per table):
SELECT 'CUSTOMERS' AS TBL, COUNT(*) AS ROWS_ FROM CUSTOMERS UNION ALL SELECT 'ORDERS', COUNT(*) FROM ORDERS;
