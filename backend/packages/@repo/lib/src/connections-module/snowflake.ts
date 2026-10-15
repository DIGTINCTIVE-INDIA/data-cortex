import { createPrivateKey } from "node:crypto";

import type { TestConnectionPayload } from "@repo/types";
import snowflake from "snowflake-sdk";

export type SnowflakeColumn = { name: string; type: string };
export type SnowflakeResult = { rows: Record<string, unknown>[]; columns: SnowflakeColumn[] };

// The SDK logs connection detail by default, and a connection string is not something to
// write to a server log.
snowflake.configure({ logLevel: "OFF" });

/**
 * Snowflake only accepts a private key as PKCS#8. Keys are commonly PKCS#1 ("BEGIN RSA
 * PRIVATE KEY", which is what the stored one is) or encrypted, so it is re-encoded here
 * instead of asking the person who pasted it to convert it first.
 */
export function toPkcs8Pem(pem: string, passphrase?: string) {
	return createPrivateKey({ key: pem, passphrase: passphrase || undefined })
		.export({ type: "pkcs8", format: "pem" })
		.toString();
}

/**
 * The account for a connection. The form stores it in `host`, and also in
 * additionalParams.account; either may be present, the explicit one wins.
 */
const accountOf = (payload: TestConnectionPayload) => payload.additionalParams?.account || payload.host;

function connectionOptions(payload: TestConnectionPayload): snowflake.ConnectionOptions {
	const params = payload.additionalParams ?? {};

	const base = {
		account: accountOf(payload),
		username: payload.username,
		database: payload.databaseName,
		schema: payload.dbSchema,
		warehouse: params.warehouse,
		role: params.role || undefined,
		// Fail in seconds, not minutes, on a wrong account or an unreachable network.
		timeout: 15000,
	};

	if (payload.secretType === "key_pair") {
		return {
			...base,
			authenticator: "SNOWFLAKE_JWT",
			privateKey: toPkcs8Pem(payload.secret, params.privateKeyPassphrase),
		};
	}

	return { ...base, password: payload.secret };
}

/**
 * Runs one statement on a fresh connection and always closes it.
 *
 * One connection per call is deliberate: callers here are occasional (a connection test,
 * a table list, an explorer query), and pooling would keep warehouses awake and
 * credentials in memory for longer than any of them needs.
 */
export async function snowflakeQuery(
	payload: TestConnectionPayload,
	sqlText: string,
	binds: (string | number)[] = [],
	sessionStatements: string[] = [],
): Promise<SnowflakeResult> {
	const connection = snowflake.createConnection(connectionOptions(payload));

	await new Promise<void>((resolve, reject) => connection.connect(error => (error ? reject(error) : resolve())));

	const run = (text: string, params: (string | number)[] = []) =>
		new Promise<SnowflakeResult>((resolve, reject) => {
			connection.execute({
				sqlText: text,
				binds: params,
				complete: (error, statement, rows) => {
					if (error) return reject(error);

					const columns = (statement.getColumns() ?? []).map(column => ({
						name: column.getName(),
						type: column.getType(),
					}));

					resolve({ rows: (rows ?? []) as Record<string, unknown>[], columns });
				},
			});
		});

	try {
		for (const statement of sessionStatements) await run(statement);

		return await run(sqlText, binds);
	} finally {
		await new Promise<void>(resolve => connection.destroy(() => resolve()));
	}
}
