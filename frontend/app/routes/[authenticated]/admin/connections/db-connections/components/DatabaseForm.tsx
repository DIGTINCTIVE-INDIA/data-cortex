import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/lib/useApi";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

type DatabaseType = "postgres" | "snowflake";

type FormValues = {
  databaseType: DatabaseType;
  connectionString: string;
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  schema: string;
  snowflakeAccount: string;
  snowflakeWarehouse: string;
  snowflakeRole: string;
  snowflakeAuthType: SnowflakeAuthType;
  snowflakePrivateKey: string;
  snowflakePassphrase: string;
  ssl: boolean;
};

type SnowflakeAuthType = "password" | "key-pair";

type ConnectionParts = {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  schema: string;
  ssl: boolean;
};

/**
 * sslmode -> the SSL switch.
 *
 * Only "disable" means no encryption. Everything else (require, verify-ca,
 * verify-full, prefer, allow, and the node-postgres extension "no-verify")
 * encrypts, so they all map to true. An absent sslmode also maps to true,
 * matching the form default -- the old code mapped it to false, which silently
 * turned SSL off whenever someone pasted a URL without the parameter.
 */
const sslFromMode = (mode: string | null) => mode !== "disable";

/**
 * Accepts a PEM however it arrives and returns it with real line breaks.
 *
 * The same key reaches this form three ways, each with different line endings:
 * pasted from a .p8 file (CRLF on Windows), pasted out of an env file (one line
 * with literal \n escapes, often quoted), or read from a file picker. Storing it
 * without normalising produces a key that looks right and fails to parse.
 */
const normalizePrivateKey = (raw: string) => {
  let value = raw.trim();

  const quoted =
    value.length > 1 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));

  if (quoted) value = value.slice(1, -1);

  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
};

const PRIVATE_KEY_PATTERN = /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----$/;

const KEY_FILE_ACCEPT = ".p8,.pem,.key,.txt";

const parsePostgresConnectionString = (connectionString: string): ConnectionParts | null => {
  try {
    const url = new URL(connectionString.trim());

    const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";

    if (!isPostgres) {
      throw new Error("Invalid PostgreSQL connection string");
    }

    const schema =
      url.searchParams.get("schema") ||
      url.searchParams.get("currentSchema") ||
      url.searchParams.get("search_path") ||
      "public";

    return {
      host: url.hostname,
      port: url.port || "5432",
      // replace(/^\//) rather than replace("/") -- the latter only drops the
      // first slash wherever it appears.
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      schema,
      ssl: sslFromMode(url.searchParams.get("sslmode")),
    };
  } catch {
    return null;
  }
};

/** The other direction: fields -> URL, so editing a field keeps the string honest. */
const buildPostgresConnectionString = (parts: ConnectionParts) => {
  if (!parts.host || !parts.database) return "";

  const credentials = parts.username
    ? `${encodeURIComponent(parts.username)}${parts.password ? `:${encodeURIComponent(parts.password)}` : ""}@`
    : "";

  const params = new URLSearchParams();
  params.set("sslmode", parts.ssl ? "require" : "disable");
  if (parts.schema && parts.schema !== "public") params.set("schema", parts.schema);

  return `postgresql://${credentials}${parts.host}:${parts.port || "5432"}/${encodeURIComponent(parts.database)}?${params}`;
};

/** Two connections are "in sync" when every field matches. */
const sameConnection = (a: ConnectionParts | null, b: ConnectionParts | null) =>
  !!a &&
  !!b &&
  a.host === b.host &&
  a.port === b.port &&
  a.database === b.database &&
  a.username === b.username &&
  a.password === b.password &&
  a.schema === b.schema &&
  a.ssl === b.ssl;

export const DatabaseForm = () => {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      databaseType: "postgres",
      connectionString: "",
      name: "",
      host: "",
      port: "5432",
      database: "",
      username: "",
      password: "",
      schema: "public",
      snowflakeAccount: "",
      snowflakeWarehouse: "",
      snowflakeRole: "",
      snowflakeAuthType: "password",
      snowflakePrivateKey: "",
      snowflakePassphrase: "",
      ssl: true,
    },
  });

  const databaseType = watch("databaseType");
  const snowflakeAuthType = watch("snowflakeAuthType");
  const isKeyPair = databaseType === "snowflake" && snowflakeAuthType === "key-pair";

  const keyFileRef = useRef<HTMLInputElement>(null);

  // Reading the file here rather than uploading it: the key has to end up in the
  // same field as a pasted one, so both paths normalise identically.
  const loadKeyFile = async (file: File | undefined) => {
    if (!file) return;

    try {
      const text = await file.text();
      const normalized = normalizePrivateKey(text);

      if (!PRIVATE_KEY_PATTERN.test(normalized)) {
        toast.error(`"${file.name}" does not look like a PEM private key`, {
          description: "Expected a BEGIN/END PRIVATE KEY block.",
        });
        return;
      }

      setValue("snowflakePrivateKey", normalized, { shouldValidate: true });
      toast.success(`Loaded ${file.name}`);
    } catch {
      toast.error(`Could not read "${file.name}"`);
    } finally {
      if (keyFileRef.current) keyFileRef.current.value = "";
    }
  };

  const { isPending, mutateAsync } = useApi("POST /api/db/connections/add");

  // The last string we successfully parsed. Paste fires, then blur fires with the
  // same text -- without this the fields are filled twice and the toast appears twice.
  const lastParsed = useRef<string | null>(null);

  const fillFromConnectionString = async (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) return;
    if (lastParsed.current === trimmed) return;

    const parsed = parsePostgresConnectionString(trimmed);

    if (!parsed) {
      toast.error("Invalid PostgreSQL connection string");
      return;
    }

    lastParsed.current = trimmed;

    setValue("databaseType", "postgres", { shouldValidate: true });
    setValue("host", parsed.host, { shouldValidate: true });
    setValue("port", parsed.port, { shouldValidate: true });
    setValue("database", parsed.database, { shouldValidate: true });
    setValue("username", parsed.username, { shouldValidate: true });
    setValue("password", parsed.password, { shouldValidate: true });
    setValue("schema", parsed.schema, { shouldValidate: true });
    setValue("ssl", parsed.ssl, { shouldValidate: true });

    await trigger(["databaseType", "host", "port", "database", "username", "password", "schema", "ssl"]);

    toast.success("Connection fields auto-filled");
  };

  // The other direction: edit any field and the connection string follows.
  const [host, port, database, username, password, schema, ssl] = watch([
    "host",
    "port",
    "database",
    "username",
    "password",
    "schema",
    "ssl",
  ]);

  useEffect(() => {
    if (databaseType !== "postgres") return;

    const fields: ConnectionParts = {
      host,
      port: port || "5432",
      database,
      username,
      password,
      schema: schema || "public",
      ssl: !!ssl,
    };

    // Not enough to form a URL yet -- otherwise you'd watch it build itself
    // character by character while typing the host.
    if (!fields.host || !fields.database) return;

    // getValues, not watch: reading the string here must not make this effect
    // depend on it, or writing it below would retrigger the effect.
    const current = getValues("connectionString");

    // Already describes the same connection -- leave the user's exact text alone
    // rather than normalising sslmode=verify-full into sslmode=require.
    if (sameConnection(parsePostgresConnectionString(current), fields)) return;

    const next = buildPostgresConnectionString(fields);

    if (next && next !== current) {
      lastParsed.current = next;
      setValue("connectionString", next, { shouldValidate: false });
    }
  }, [databaseType, host, port, database, username, password, schema, ssl, getValues, setValue]);

  const onSubmit = async (data: FormValues) => {
    const payload =
      data.databaseType === "postgres"
        ? {
            connectionName: data.name,
            databaseType: "postgres" as const,
            host: data.host,
            port: Number(data.port),
            databaseName: data.database,
            username: data.username,
            secret: data.password,
            secretType: "password" as const,
            dbSchema: data.schema,
            additionalParams: {
              ssl: data.ssl,
            },
          }
        : {
            connectionName: data.name,
            databaseType: "snowflake" as const,
            host: data.snowflakeAccount,
            port: 443,
            databaseName: data.database,
            username: data.username,
            // One column holds either credential; secretType says which, so nothing
            // downstream has to guess from the shape of the value.
            secret:
              data.snowflakeAuthType === "key-pair"
                ? normalizePrivateKey(data.snowflakePrivateKey)
                : data.password,
            secretType: data.snowflakeAuthType === "key-pair" ? ("key_pair" as const) : ("password" as const),
            dbSchema: data.schema,
            additionalParams: {
              account: data.snowflakeAccount,
              warehouse: data.snowflakeWarehouse,
              role: data.snowflakeRole || undefined,
              privateKeyPassphrase:
                data.snowflakeAuthType === "key-pair" && data.snowflakePassphrase
                  ? data.snowflakePassphrase
                  : undefined,
            },
          };

    try {
      await mutateAsync(payload);
      toast.success("Connection saved successfully");
      reset();
    } catch {
      // toast.error("Failed to save connection");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Controller
        name="databaseType"
        control={control}
        rules={{ required: "Database type is required" }}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger required label="Database Type" error={errors.databaseType?.message}>
              <SelectValue placeholder="Select database type">
                {field.value === "postgres" && "PostgreSQL"}
                {field.value === "snowflake" && "Snowflake"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="postgres">PostgreSQL</SelectItem>
              <SelectItem value="snowflake">Snowflake</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      {databaseType === "postgres" && (
        <Input
          label="PostgreSQL Connection String"
          placeholder="postgresql://svc_user:password@db.internal.example.com:5432/analytics?sslmode=require"
          error={errors.connectionString?.message}
          {...register("connectionString", {
            // On blur, not onChange: parsing every keystroke re-toasted
            // "invalid" for each character typed before the URL was complete.
            onBlur: event => {
              void fillFromConnectionString(event.target.value);
            },
          })}
          onPaste={event => {
            const value = event.clipboardData.getData("text");
            // after the paste lands in the input
            setTimeout(() => void fillFromConnectionString(value), 0);
          }}
        />
      )}

      <Input
        required
        label="Connection Name"
        placeholder={databaseType === "postgres" ? "Production Postgres" : "Production Snowflake"}
        error={errors.name?.message}
        {...register("name", {
          required: "Connection name is required",
          minLength: {
            value: 3,
            message: "Minimum 3 characters required",
          },
        })}
      />

      {databaseType === "postgres" ? (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Input
              required
              label="Host"
              placeholder="db.internal.example.com"
              error={errors.host?.message}
              {...register("host", {
                required: "Host is required",
              })}
            />

            <Input
              required
              label="Port"
              placeholder="5432"
              inputMode="numeric"
              error={errors.port?.message}
              {...register("port", {
                required: "Port is required",
                validate: value => Number(value) > 0 || "Enter a valid port",
              })}
            />

            <Input
              required
              label="Database"
              placeholder="analytics"
              error={errors.database?.message}
              {...register("database", {
                required: "Database name is required",
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Input
              required
              label="Username"
              placeholder="svc_datacortex"
              error={errors.username?.message}
              {...register("username", {
                required: "Username is required",
              })}
            />

            <Input
              required
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register("password", {
                required: "Password is required",
              })}
            />
          </div>

          <Input
            required
            label="Schema"
            placeholder="public"
            error={errors.schema?.message}
            {...register("schema", {
              required: "Schema is required",
            })}
          />

          <Controller
            name="ssl"
            control={control}
            render={({ field }) => (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">SSL Enabled</label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {field.value
                        ? "SSL is enabled. Use this for cloud databases like Neon, Supabase, RDS, or production PostgreSQL."
                        : "SSL is disabled. Use this only for local or trusted internal PostgreSQL databases."}
                    </p>
                  </div>

                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              </div>
            )}
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Input
              required
              label="Account Identifier"
              placeholder="org-account or account.region"
              error={errors.snowflakeAccount?.message}
              {...register("snowflakeAccount", {
                required: "Snowflake account identifier is required",
              })}
            />

            <Input
              required
              label="Warehouse"
              placeholder="COMPUTE_WH"
              error={errors.snowflakeWarehouse?.message}
              {...register("snowflakeWarehouse", {
                required: "Warehouse is required",
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Input
              required
              label="Database"
              placeholder="ANALYTICS_DB"
              error={errors.database?.message}
              {...register("database", {
                required: "Database is required",
              })}
            />

            <Input
              required
              label="Schema"
              placeholder="PUBLIC"
              error={errors.schema?.message}
              {...register("schema", {
                required: "Schema is required",
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Input
              required
              label="Username"
              placeholder="SERVICE_USER"
              error={errors.username?.message}
              {...register("username", {
                required: "Username is required",
              })}
            />

            <Controller
              name="snowflakeAuthType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger label="Authentication" error={errors.snowflakeAuthType?.message}>
                    <SelectValue placeholder="Select authentication">
                      {field.value === "password" && "Password"}
                      {field.value === "key-pair" && "Key pair"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="password">Password</SelectItem>
                    <SelectItem value="key-pair">Key pair</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {!isKeyPair ? (
            <Input
              required
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register("password", {
                validate: value => isKeyPair || value.trim().length > 0 || "Password is required",
              })}
            />
          ) : (
            <div className="space-y-4 rounded-xl border border-border bg-card px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {/* Marked by hand: this field is a Textarea with its own heading
                      rather than a `label` prop, so it cannot take the shared marker. */}
                  <p className="text-sm font-medium text-foreground">
                    Private Key
                    <span aria-hidden="true" className="ml-0.5 text-destructive">
                      *
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paste the whole key, or load a .p8 file. Line breaks are normalised either way.
                  </p>
                </div>

                <Button type="button" variant="secondary" onClick={() => keyFileRef.current?.click()}>
                  Choose key file
                </Button>

                <input
                  ref={keyFileRef}
                  type="file"
                  accept={KEY_FILE_ACCEPT}
                  className="hidden"
                  onChange={event => void loadKeyFile(event.target.files?.[0])}
                />
              </div>

              <Controller
                name="snowflakePrivateKey"
                control={control}
                rules={{
                  validate: value => {
                    if (!isKeyPair) return true;
                    if (!value.trim()) return "Private key is required";

                    return (
                      PRIVATE_KEY_PATTERN.test(normalizePrivateKey(value)) ||
                      "That does not look like a PEM private key (expected a BEGIN/END PRIVATE KEY block)"
                    );
                  },
                }}
                render={({ field }) => (
                  <Textarea
                    rows={8}
                    spellCheck={false}
                    className="font-mono text-xs"
                    placeholder={"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqh...\n-----END PRIVATE KEY-----"}
                    error={errors.snowflakePrivateKey?.message}
                    value={field.value}
                    onChange={field.onChange}
                    // Normalise on blur, so what is shown is what gets stored.
                    onBlur={() => field.onChange(normalizePrivateKey(field.value))}
                  />
                )}
              />

              <Input
                label="Key Passphrase"
                type="password"
                placeholder="Leave empty for an unencrypted key"
                {...register("snowflakePassphrase")}
              />
            </div>
          )}

          <Input label="Role" placeholder="SYSADMIN / ANALYST_ROLE" {...register("snowflakeRole")} />
        </>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Save Connection"}
      </Button>
    </form>
  );
};
