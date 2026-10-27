// qc-file-schema.repo.ts
import type { ColumnSchema, FileRow, InferredDataType, SourceFileType } from "@repo/types";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import csvParser from "csv-parser";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";

export type FileDelimiter = "comma" | "pipe" | "tab" | "semicolon";

const SEPARATORS: Record<FileDelimiter, string> = { comma: ",", pipe: "|", tab: "\t", semicolon: ";" };

export class QCFileSchemaRepo {
	static async readRowsByFileType(
		stream: Readable,
		fileType: SourceFileType,
		maxRows: number,
		delimiter: FileDelimiter = "comma",
	): Promise<FileRow[]> {
		switch (fileType) {
			case "csv":
				return this.readCsvRows(stream, maxRows, delimiter);

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

	/**
	 * Which delimiter a csv uses, worked out from the start of the file the way the engine does
	 * when a check has none set (it sniffs a sample): the delimiter that appears the same number
	 * of times on (nearly) every record wins.
	 *
	 * Records, not text lines: a quoted cell may contain line breaks and delimiters, so the
	 * sample is split into records with the quotes respected, and delimiters inside quotes are
	 * never counted.
	 *
	 * When no delimiter is that consistent (ragged rows, say), the header record decides --
	 * its delimiter is the one that produces the columns -- and comma is the answer only when
	 * the header has none of them.
	 */
	static sniffDelimiter(sample: string, truncated: boolean): FileDelimiter {
		const order: FileDelimiter[] = ["comma", "tab", "semicolon", "pipe"];
		const text = sample.replace(/^﻿/, "");

		// One pass: split into records, counting every candidate outside quotes as it goes.
		type Counts = Partial<Record<FileDelimiter, number>>;
		const records: Counts[] = [];
		let current: Counts = {};
		let quoted = false;
		let hasContent = false;

		for (const character of text) {
			if (character === '"') {
				quoted = !quoted;
				hasContent = true;
			} else if (!quoted && (character === "\n" || character === "\r")) {
				if (hasContent) records.push(current);
				current = {};
				hasContent = false;
			} else {
				if (character.trim() !== "") hasContent = true;

				if (!quoted) {
					for (const name of order) {
						if (character === SEPARATORS[name]) current[name] = (current[name] ?? 0) + 1;
					}
				}
			}
		}

		// The sample ends wherever a chunk happened to end, so the last record may be cut short --
		// unless it is the only one, in which case it is all the evidence there is.
		if (hasContent && (!truncated || records.length === 0)) records.push(current);
		const used = records.slice(0, 20);

		if (used.length === 0) return "comma";

		let best: { name: FileDelimiter; consistency: number; perRecord: number } | null = null;

		for (const name of order) {
			const frequency = new Map<number, number>();

			for (const record of used) {
				const found = record[name] ?? 0;
				if (found > 0) frequency.set(found, (frequency.get(found) ?? 0) + 1);
			}

			if (frequency.size === 0) continue;

			const [perRecord, agreeing] = [...frequency.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]!;
			const consistency = agreeing / used.length;

			if (consistency < 0.9) continue;

			// An earlier name keeps a tie.
			if (!best || consistency > best.consistency || (consistency === best.consistency && perRecord > best.perRecord)) {
				best = { name, consistency, perRecord };
			}
		}

		if (best) return best.name;

		// Nothing was consistent: use whichever delimiter the header record has most of.
		const header = used[0]!;
		let fallback: FileDelimiter = "comma";
		let most = 0;

		for (const name of order) {
			if ((header[name] ?? 0) > most) {
				most = header[name]!;
				fallback = name;
			}
		}

		return fallback;
	}

	/**
	 * Reads the start of a csv, works out its delimiter from it, and returns a stream that still
	 * begins at the first byte -- what was read is put back in front.
	 *
	 * How much is read scales with the file: SAMPLE_PERCENT of its size, but never less than
	 * MIN_SAMPLE_BYTES (a small file is simply read whole) and never more than MAX_SAMPLE_BYTES
	 * (a huge file is not downloaded to learn one character). Whatever the percentage works out
	 * to, it keeps reading until it holds MIN_SAMPLE_LINES complete lines, so a file with
	 * hundreds of columns -- whose lines are long -- still gives enough lines to judge by. The
	 * byte cap wins over everything, for a file with enormous lines or none.
	 */
	static async detectDelimiter(
		stream: Readable,
		totalBytes?: number,
	): Promise<{ delimiter: FileDelimiter; stream: Readable }> {
		const SAMPLE_PERCENT = 5;
		const MIN_SAMPLE_BYTES = 64 * 1024;
		const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;
		const MIN_SAMPLE_LINES = 10;

		const byPercent = totalBytes ? Math.ceil((totalBytes * SAMPLE_PERCENT) / 100) : 0;
		const target = Math.min(MAX_SAMPLE_BYTES, Math.max(MIN_SAMPLE_BYTES, byPercent));

		const chunks: Buffer[] = [];
		let size = 0;
		let lineBreaks = 0;
		let ended = false;

		await new Promise<void>((resolve, reject) => {
			const onData = (chunk: Buffer | string) => {
				const buffer = Buffer.from(chunk);

				chunks.push(buffer);
				size += buffer.length;
				lineBreaks += buffer.filter(byte => byte === 0x0a).length;

				// One line break past the minimum, so the last line counted is complete.
				if ((size >= target && lineBreaks > MIN_SAMPLE_LINES) || size >= MAX_SAMPLE_BYTES) {
					stream.off("data", onData);
					stream.pause();
					resolve();
				}
			};

			stream.once("error", reject);
			stream.once("end", () => {
				ended = true;
				resolve();
			});
			stream.on("data", onData);
		});

		const head = Buffer.concat(chunks);
		// Unless the whole file was read, the sample stops wherever a chunk happened to end.
		const delimiter = this.sniffDelimiter(head.toString("utf8"), !ended);

		async function* replay() {
			for (const chunk of chunks) yield chunk;
			for await (const chunk of stream) yield chunk as Buffer;
		}

		return { delimiter, stream: Readable.from(replay()) };
	}

	/**
	 * A file read with the wrong delimiter does not fail: the whole header becomes ONE column
	 * ("id;name;qty;code;grade"), which then looks like a schema. If the only column contains a
	 * different delimiter, say so instead of returning that.
	 */
	static assertDelimiterFits(columns: ColumnSchema[], delimiter: FileDelimiter): void {
		if (columns.length !== 1) return;

		const header = columns[0]!.columnName;
		const others = (Object.entries(SEPARATORS) as [FileDelimiter, string][]).filter(
			([name, character]) => name !== delimiter && header.includes(character),
		);

		if (others.length === 0) return;

		throw new ErrorResponse(
			`The file's header has one column, "${header}", which looks ${others[0]![0]}-separated, but the delimiter is set to ${delimiter}. Change the delimiter and fetch again.`,
			400,
		);
	}

	static async readCsvRows(stream: Readable, maxRows: number, delimiter: FileDelimiter = "comma"): Promise<FileRow[]> {
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
				.pipe(csvParser({ separator: SEPARATORS[delimiter] ?? "," }))
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
