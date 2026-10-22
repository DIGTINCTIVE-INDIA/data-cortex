// qc-file-schema.repo.ts
import type { ColumnSchema, FileRow, InferredDataType, SourceFileType } from "@repo/types";
import csvParser from "csv-parser";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";

export class QCFileSchemaRepo {
	static async readRowsByFileType(stream: Readable, fileType: SourceFileType, maxRows: number): Promise<FileRow[]> {
		switch (fileType) {
			case "csv":
				return this.readCsvRows(stream, maxRows);

			case "excel":
				return this.readExcelRows(stream, maxRows);

			case "json":
				return this.readJsonRows(stream, maxRows);

			default: {
				const exhaustiveCheck: never = fileType;
				throw new Error(`Unsupported file type: ${exhaustiveCheck}`);
			}
		}
	}

	/**
	 * The configured name is the object's exact name, extension included. Only a name saved
	 * without one (older configs) gets the extension its file type implies.
	 */
	static buildFileName(fileName: string, fileType: SourceFileType): string {
		const cleanName = fileName.trim().replace(/^\/+|\/+$/g, "");
		return /\.[A-Za-z0-9]{1,8}$/.test(cleanName) ? cleanName : `${cleanName}.${this.getExtension(fileType)}`;
	}

	static buildFileKey(path: string, fileName: string, fileType: SourceFileType): string {
		const cleanPath = path.replace(/^\/+|\/+$/g, "");

		return [cleanPath, this.buildFileName(fileName, fileType)].filter(Boolean).join("/");
	}

	static getExtension(fileType: SourceFileType): "csv" | "xlsx" | "json" {
		if (fileType === "excel") return "xlsx";
		return fileType;
	}

	static inferColumns(rows: FileRow[]): ColumnSchema[] {
		const columnNames = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

		return columnNames.map((columnName, index) => {
			let dataType: InferredDataType = "null";
			let nullable = false;

			// Every sampled value votes, not just the first. Typing a column from its first
			// value made "12, 40, abc" an integer column, and the engine's data-type check
			// then reported "abc" as a failure of a schema that was never right.
			for (const row of rows) {
				const value = row[columnName];

				if (this.isNullLike(value)) {
					nullable = true;
					continue;
				}

				dataType = this.mergeTypes(dataType, this.detectDataType(value));

				// Nothing is broader than string, so the remaining rows cannot change it.
				if (dataType === "string") break;
			}

			return {
				columnName,
				columnOrder: index + 1,
				dataType,
				nullable,
			};
		});
	}

	static async readCsvRows(stream: Readable, maxRows: number): Promise<FileRow[]> {
		return await new Promise<FileRow[]>((resolve, reject) => {
			const rows: FileRow[] = [];
			let settled = false;

			const resolveOnce = () => {
				if (settled) return;
				settled = true;
				resolve(rows);
			};

			const rejectOnce = (error: Error) => {
				if (settled) return;
				settled = true;
				reject(error);
			};

			stream
				.pipe(csvParser())
				.on("data", (row: FileRow) => {
					if (settled) return;

					rows.push(row);

					if (rows.length >= maxRows) {
						stream.destroy();
						resolveOnce();
					}
				})
				.on("end", resolveOnce)
				.on("error", rejectOnce);
		});
	}

	static async readExcelRows(stream: Readable, maxRows: number): Promise<FileRow[]> {
		const rows: FileRow[] = [];

		const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
			entries: "emit",
			sharedStrings: "cache",
			styles: "ignore",
			worksheets: "emit",
		});

		for await (const worksheetReader of workbookReader) {
			let headers: string[] = [];

			for await (const row of worksheetReader) {
				const values = Array.isArray(row.values) ? row.values.slice(1) : [];

				if (!headers.length) {
					headers = values.map((value: unknown, index: number) => String(value || `Column ${index + 1}`).trim());
					continue;
				}

				const item: FileRow = {};

				headers.forEach((header, index) => {
					item[header] = values[index] ?? null;
				});

				rows.push(item);

				if (rows.length >= maxRows) {
					stream.destroy();
					return rows;
				}
			}

			break;
		}

		return rows;
	}

	static async readJsonRows(stream: Readable, maxRows: number): Promise<FileRow[]> {
		return await new Promise<FileRow[]>((resolve, reject) => {
			const rows: FileRow[] = [];
			let settled = false;

			const resolveOnce = () => {
				if (settled) return;
				settled = true;
				resolve(rows);
			};

			const rejectOnce = (error: Error) => {
				if (settled) return;
				settled = true;
				reject(error);
			};

			const jsonParser = parser() as unknown as NodeJS.ReadWriteStream;
			const jsonArrayStreamer = streamArray() as unknown as NodeJS.ReadWriteStream;

			const pipeline = stream.pipe(jsonParser).pipe(jsonArrayStreamer);

			pipeline
				.on("data", (chunk: { value: unknown }) => {
					if (settled) return;

					if (this.isFileRow(chunk.value)) {
						rows.push(chunk.value);
					}

					if (rows.length >= maxRows) {
						stream.destroy();
						resolveOnce();
					}
				})
				.on("end", resolveOnce)
				.on("error", rejectOnce);
		});
	}

	static isFileRow(value: unknown): value is FileRow {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	static isNullLike(value: unknown): boolean {
		return value === null || value === undefined || String(value).trim() === "";
	}

	static detectDataType(value: unknown): InferredDataType {
		if (typeof value === "boolean") return "boolean";
		if (value instanceof Date) return "datetime";

		const raw = String(value).trim();

		if (/^(true|false)$/i.test(raw)) return "boolean";
		if (/^-?\d+$/.test(raw)) return "integer";
		if (/^-?\d+\.\d+$/.test(raw)) return "decimal";

		// ISO shapes only. Date.parse accepts far more than dates in V8 -- "12 apples" parses --
		// so using it turned ordinary text into datetime columns. These are the same shapes the
		// engine's value check accepts (dc-engine/trad_ct_id/type_mapping.py).
		if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(raw)) return "date";

		if (
			/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(
				raw,
			)
		) {
			return "datetime";
		}

		return "string";
	}

	/**
	 * What one column is, given what it was so far and one more value's type.
	 * Equal stays; integer + decimal widens to decimal; date + datetime widens to datetime;
	 * anything else cannot share a type, so it is string.
	 */
	static mergeTypes(current: InferredDataType, next: InferredDataType): InferredDataType {
		if (current === "null") return next;
		if (current === next) return current;

		const pair = new Set([current, next]);

		if (pair.has("integer") && pair.has("decimal") && pair.size === 2) return "decimal";
		if (pair.has("date") && pair.has("datetime") && pair.size === 2) return "datetime";

		return "string";
	}
}
