import fs from "fs/promises";
import path from "path";
import YAML from "yaml";

import { __dirname } from "../utils.js";

export class FStool {
	root = __dirname();

	private async pathExists(target: string) {
		try {
			await fs.access(target);
			return true;
		} catch {
			return false;
		}
	}

	async writeFile({ file, content }: { file: string; content: string }) {
		await fs.writeFile(path.resolve(this.root, file), content);
	}

	async writeJSONFile({ file, content, dir }: { file: string; content: object; dir?: string }) {
		file = `${file}.json`;

		let destination = path.resolve(this.root, file);

		if (dir) {
			const dirPath = path.resolve(this.root, dir);
			await this.ensurePathExists({ dir });
			destination = path.resolve(dirPath, file);
		}

		await fs.writeFile(destination, JSON.stringify(content, null, 2));
	}

	async readFile({ file }: { file: string }) {
		return await fs.readFile(path.resolve(this.root, file), "utf-8");
	}

	async readJSONFile<T>({ file, dir }: { file: string; dir?: string }) {
		try {
			file = `${file}.json`;
			const fullPath = path.resolve(this.root, dir ?? "", file);
			const data = await fs.readFile(fullPath, "utf-8");
			return JSON.parse(data) as T;
		} catch (error) {
			console.error(`Failed to read JSON file at ${file}:`, error);
			return null;
		}
	}

	async readYamlFile({ file, dir }: { file: string; dir?: string }) {
		try {
			file = `${file}.yaml`;
			const fullPath = path.resolve(this.root, dir ?? "", file);
			const data = await fs.readFile(fullPath, "utf-8");
			return YAML.parseDocument(data);
		} catch (error) {
			console.error(`Failed to read Yaml file at ${file}:`, error);
			return null;
		}
	}

	async ensurePathExists({ dir }: { dir: string }) {
		const fullPath = path.resolve(this.root, dir);
		if (!(await this.pathExists(fullPath))) {
			await fs.mkdir(fullPath, { recursive: true });
		}
	}

	async avoidOverriding({ file }: { file: string }) {
		const fullPath = path.resolve(this.root, file);
		if (await this.pathExists(fullPath)) {
			throw new Error(`File ${fullPath} already exists`);
		}
	}

	async removeFile({ file }: { file: string }) {
		const fullPath = path.resolve(this.root, file);
		if (await this.pathExists(fullPath)) {
			await fs.unlink(fullPath);
		}
	}

	async removeDirectory({ dir, target }: { dir: string; target: string }) {
		const fullPath = path.resolve(this.root, dir, target);
		if (await this.pathExists(fullPath)) {
			await fs.rm(fullPath, { recursive: true, force: true });
		}
	}

	async copyFile({ from, to }: { from: string; to: string }) {
		await this.ensurePathExists({ dir: path.dirname(to) });
		await fs.copyFile(path.resolve(this.root, from), path.resolve(this.root, to));
	}

	async copyDirectory({
		from,
		to,

		recursive = true,
		include,
		exclude,
	}: {
		from: string;
		to: string;
		recursive?: boolean;
		include?: RegExp;
		exclude?: RegExp;
	}) {
		const source = path.resolve(this.root, from);
		const destination = path.resolve(this.root, to);

		if (!(await this.pathExists(source))) return;

		await this.ensurePathExists({ dir: path.join(to) });

		const entries = await fs.readdir(source, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(source, entry.name);
			const destPath = path.join(destination, entry.name);

			const shouldInclude =
				(!include || include.test(entry.name)) && (!exclude || !exclude.test(entry.name));

			if (entry.isDirectory()) {
				if (recursive) {
					await this.copyDirectory({
						from: path.join(from, entry.name),
						to: path.join(to, entry.name),
						recursive,
						include,
						exclude,
					});
				}
			} else if (entry.isFile()) {
				if (shouldInclude) {
					await fs.copyFile(srcPath, destPath);
				}
			}
		}
	}
	async listDirectories({ dir }: { dir: string }) {
		try {
			const entries = await fs.readdir(path.resolve(this.root, dir), {
				withFileTypes: true,
			});
			return entries.filter(e => e.isDirectory()).map(e => e.name);
		} catch (error) {
			console.error(`Error listing directories in ${dir}:`, error); // Exposes the error
			return [];
		}
	}

	async listFiles({ dir }: { dir: string }) {
		try {
			const entries = await fs.readdir(path.resolve(this.root, dir), {
				withFileTypes: true,
			});
			return entries.filter(e => e.isFile()).map(e => e.name);
		} catch (error) {
			console.error(`Error listing files in ${dir}:`, error); // Exposes the error
			return [];
		}
	}
}

export const fsTool = new FStool();
