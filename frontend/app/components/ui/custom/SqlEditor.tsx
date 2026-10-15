import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";

export type SqlEditorColumn = {
  columnName: string;
  dataType: string;
  nullable?: boolean;
  position?: number;
};

export type SqlEditorTable = {
  tableName: string;
  columns: SqlEditorColumn[];
};

export type SqlEditorSchema = {
  schemaName: string;
  tables: SqlEditorTable[];
};

type SqlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  schemas: SqlEditorSchema[];
  height?: string;
  disabled?: boolean;
};

type MonacoInstance = typeof Monaco;

const MONACO_THEME_NAME = "datasymphony-sql";

const sqlKeywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "FULL JOIN",
  "ON",
  "AND",
  "OR",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "DISTINCT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "IS NULL",
  "IS NOT NULL",
  "IN",
  "NOT IN",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "ASC",
  "DESC",
];

const postgresFunctions = [
  "COALESCE",
  "NULLIF",
  "LOWER",
  "UPPER",
  "TRIM",
  "LENGTH",
  "NOW",
  "CURRENT_DATE",
  "CURRENT_TIMESTAMP",
  "DATE_TRUNC",
  "EXTRACT",
  "ROUND",
  "CAST",
];

export const SqlEditor = ({ value, onChange, schemas, height = "360px", disabled }: SqlEditorProps) => {
  const [themeVersion, setThemeVersion] = useState(0);

  const monacoRef = useRef<MonacoInstance | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const providerDisposableRef = useRef<Monaco.IDisposable | null>(null);

  const tableLookup = useMemo(() => {
    const map = new Map<string, SqlEditorTable>();

    for (const schema of schemas) {
      for (const table of schema.tables) {
        map.set(table.tableName.toLowerCase(), table);
        map.set(`${schema.schemaName}.${table.tableName}`.toLowerCase(), table);
      }
    }

    return map;
  }, [schemas]);

  useEffect(() => {
    if (!monacoRef.current) return;

    providerDisposableRef.current?.dispose();

    providerDisposableRef.current = registerSqlCompletionProvider({
      monaco: monacoRef.current,
      schemas,
      tableLookup,
    });

    return () => {
      providerDisposableRef.current?.dispose();
    };
  }, [schemas, tableLookup]);

  useEffect(() => {
    const applyTheme = () => {
      if (!monacoRef.current) return;

      defineThemeFromCssVars(monacoRef.current);
      monacoRef.current.editor.setTheme(MONACO_THEME_NAME);

      editorRef.current?.updateOptions({
        theme: MONACO_THEME_NAME,
      });

      editorRef.current?.layout();
      setThemeVersion(value => value + 1);
    };

    applyTheme();

    const observer = new MutationObserver(applyTheme);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      });
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

    monaco.languages.setLanguageConfiguration("sql", {
      comments: {
        lineComment: "--",
        blockComment: ["/*", "*/"],
      },
      brackets: [
        ["(", ")"],
        ["[", "]"],
      ],
      autoClosingPairs: [
        { open: "(", close: ")" },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
      ],
    });

    defineThemeFromCssVars(monaco);
    monaco.editor.setTheme(MONACO_THEME_NAME);

    providerDisposableRef.current?.dispose();

    providerDisposableRef.current = registerSqlCompletionProvider({
      monaco,
      schemas,
      tableLookup,
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger("keyboard", "editor.action.triggerSuggest", {});
    });
  };

  return (
    <div
      data-theme-version={themeVersion}
      className="relative z-30 min-w-0 overflow-hidden rounded-xl border border-border bg-background">
      <Editor
        height={height}
        language="sql"
        value={value}
        onChange={nextValue => onChange(nextValue ?? "")}
        onMount={handleMount}
        theme={MONACO_THEME_NAME}
        options={{
          readOnly: disabled,
          readOnlyMessage: { value: "Please choose a source connection first" },
          fixedOverflowWidgets: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
          lineHeight: 22,
          tabSize: 2,
          wordWrap: "on",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          padding: {
            top: 12,
            bottom: 12,
          },
          suggestOnTriggerCharacters: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          acceptSuggestionOnEnter: "on",
          roundedSelection: true,
          contextmenu: true,
          overviewRulerBorder: false,
          renderLineHighlight: "line",
          renderValidationDecorations: "off",
          hideCursorInOverviewRuler: true,
          overviewRulerLanes: 0,
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
};

const defineThemeFromCssVars = (monaco: MonacoInstance) => {
  const htmlStyles = getComputedStyle(document.documentElement);
  const bodyStyles = getComputedStyle(document.body);

  const background = cssVar(bodyStyles, htmlStyles, "--background", "#ffffff");
  const foreground = cssVar(bodyStyles, htmlStyles, "--foreground", "#151b26");
  const card = cssVar(bodyStyles, htmlStyles, "--card", "#fbfbfc");
  const muted = cssVar(bodyStyles, htmlStyles, "--muted", "#f4f5f7");
  const mutedForeground = cssVar(bodyStyles, htmlStyles, "--muted-foreground", "#687385");
  const border = cssVar(bodyStyles, htmlStyles, "--border", "#e3e6ea");
  const primary = cssVar(bodyStyles, htmlStyles, "--primary", "#5b83f6");
  const success = cssVar(bodyStyles, htmlStyles, "--success", "#16a34a");
  const warning = cssVar(bodyStyles, htmlStyles, "--warning", "#d97706");
  const destructive = cssVar(bodyStyles, htmlStyles, "--destructive", "#dc2626");

  const isDark = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");

  monaco.editor.defineTheme(MONACO_THEME_NAME, {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "", foreground: toMonacoColor(foreground), background: toMonacoColor(background) },

      { token: "keyword", foreground: toMonacoColor(primary), fontStyle: "bold" },
      { token: "keyword.sql", foreground: toMonacoColor(primary), fontStyle: "bold" },

      { token: "operator", foreground: toMonacoColor(foreground) },
      { token: "operator.sql", foreground: toMonacoColor(foreground) },

      { token: "delimiter", foreground: toMonacoColor(foreground) },
      { token: "delimiter.sql", foreground: toMonacoColor(foreground) },
      { token: "delimiter.parenthesis", foreground: toMonacoColor(foreground) },
      { token: "delimiter.square", foreground: toMonacoColor(foreground) },

      { token: "identifier", foreground: toMonacoColor(foreground) },
      { token: "identifier.sql", foreground: toMonacoColor(foreground) },
      { token: "type.identifier", foreground: toMonacoColor(foreground) },

      { token: "string", foreground: toMonacoColor(success) },
      { token: "string.sql", foreground: toMonacoColor(success) },

      { token: "number", foreground: toMonacoColor(warning) },
      { token: "number.sql", foreground: toMonacoColor(warning) },

      { token: "comment", foreground: toMonacoColor(mutedForeground), fontStyle: "italic" },
      { token: "comment.sql", foreground: toMonacoColor(mutedForeground), fontStyle: "italic" },
    ],
    colors: {
      "editor.background": toMonacoColor(background),
      "editor.foreground": toMonacoColor(foreground),
      "editorGutter.background": toMonacoColor(background),

      "editorLineNumber.foreground": toMonacoColor(mutedForeground),
      "editorLineNumber.activeForeground": toMonacoColor(primary),

      "editor.lineHighlightBackground": toMonacoColor(withAlpha(primary, isDark ? "12" : "0f")),
      "editorCursor.foreground": toMonacoColor(primary),

      "editor.selectionBackground": toMonacoColor(withAlpha(primary, isDark ? "44" : "28")),
      "editor.inactiveSelectionBackground": toMonacoColor(withAlpha(primary, isDark ? "26" : "18")),

      "editorError.foreground": toMonacoColor(destructive),
      "editorError.background": "00000000",
      "editorWarning.foreground": toMonacoColor(warning),
      "editorWarning.background": "00000000",
      "editorInfo.foreground": toMonacoColor(primary),
      "editorInfo.background": "00000000",

      "editorUnnecessaryCode.opacity": "00000000",
      "editorOverviewRuler.errorForeground": "00000000",
      "editorOverviewRuler.warningForeground": "00000000",
      "editorOverviewRuler.infoForeground": "00000000",

      "editorWidget.background": toMonacoColor(card),
      "editorWidget.foreground": toMonacoColor(foreground),
      "editorWidget.border": toMonacoColor(border),

      "editorSuggestWidget.background": toMonacoColor(card),
      "editorSuggestWidget.foreground": toMonacoColor(foreground),
      "editorSuggestWidget.border": toMonacoColor(border),
      "editorSuggestWidget.selectedBackground": toMonacoColor(muted),
      "editorSuggestWidget.selectedForeground": toMonacoColor(foreground),
      "editorSuggestWidget.highlightForeground": toMonacoColor(primary),
      "editorSuggestWidgetStatus.foreground": toMonacoColor(mutedForeground),

      "editorHoverWidget.background": toMonacoColor(card),
      "editorHoverWidget.foreground": toMonacoColor(foreground),
      "editorHoverWidget.border": toMonacoColor(border),

      "input.background": toMonacoColor(card),
      "input.foreground": toMonacoColor(foreground),
      "input.border": toMonacoColor(border),

      focusBorder: toMonacoColor(primary),
    },
  });
};

const cssVar = (bodyStyles: CSSStyleDeclaration, htmlStyles: CSSStyleDeclaration, name: string, fallback: string) => {
  return bodyStyles.getPropertyValue(name).trim() || htmlStyles.getPropertyValue(name).trim() || fallback;
};

const withAlpha = (color: string, alpha: string) => {
  const clean = color.trim();

  if (!clean.startsWith("#")) return clean;
  if (clean.length !== 7) return clean;

  return `${clean}${alpha}`;
};

const toMonacoColor = (value: string) => {
  const clean = value.trim();

  if (clean === "transparent") {
    return "00000000";
  }

  if (clean.startsWith("#")) {
    const hex = clean.slice(1);

    if (hex.length === 3) {
      return hex
        .split("")
        .map(char => char + char)
        .join("");
    }

    return hex;
  }
  return clean;
};
const registerSqlCompletionProvider = ({
  monaco,
  schemas,
  tableLookup,
}: {
  monaco: MonacoInstance;
  schemas: SqlEditorSchema[];
  tableLookup: Map<string, SqlEditorTable>;
}) => {
  const provider: Monaco.languages.CompletionItemProvider = {
    triggerCharacters: [".", " ", '"'],

    provideCompletionItems: (
      model: Monaco.editor.ITextModel,
      position: Monaco.Position
    ): Monaco.languages.ProviderResult<Monaco.languages.CompletionList> => {
      const word = model.getWordUntilPosition(position);

      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const aliasColumnSuggestions = getAliasColumnSuggestions({
        sql: model.getValue(),
        textUntilPosition,
        tableLookup,
        monaco,
        range,
      });

      if (aliasColumnSuggestions.length) {
        return { suggestions: aliasColumnSuggestions };
      }

      const keywordSuggestions: Monaco.languages.CompletionItem[] = sqlKeywords.map(keyword => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        detail: "SQL keyword",
        sortText: `a_${keyword}`,
        range,
      }));

      const functionSuggestions: Monaco.languages.CompletionItem[] = postgresFunctions.map(fn => ({
        label: fn,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: `${fn}($1)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: "PostgreSQL function",
        sortText: `b_${fn}`,
        range,
      }));

      const schemaSuggestions: Monaco.languages.CompletionItem[] = schemas.map(schema => ({
        label: schema.schemaName,
        kind: monaco.languages.CompletionItemKind.Module,
        insertText: schema.schemaName,
        detail: "Schema",
        sortText: `c_${schema.schemaName}`,
        range,
      }));

      const tableSuggestions: Monaco.languages.CompletionItem[] = schemas.flatMap(schema =>
        schema.tables.flatMap(table => [
          {
            label: table.tableName,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.tableName,
            detail: `${schema.schemaName}.${table.tableName}`,
            documentation: `${table.columns.length} columns`,
            sortText: `d_${table.tableName}`,
            range,
          },
          {
            label: `${schema.schemaName}.${table.tableName}`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: `${schema.schemaName}.${table.tableName}`,
            detail: "Qualified table",
            documentation: `${table.columns.length} columns`,
            sortText: `d_${schema.schemaName}.${table.tableName}`,
            range,
          },
        ])
      );

      const contextualColumnSuggestions = getContextualColumnSuggestions({
        sql: model.getValue(),
        textUntilPosition,
        tableLookup,
        monaco,
        range,
      });

      return {
        suggestions: [
          ...keywordSuggestions,
          ...functionSuggestions,
          ...schemaSuggestions,
          ...tableSuggestions,
          ...contextualColumnSuggestions,
        ],
      };
    },
  };

  return monaco.languages.registerCompletionItemProvider("sql", provider);
};

const getAliasColumnSuggestions = ({
  sql,
  textUntilPosition,
  tableLookup,
  monaco,
  range,
}: {
  sql: string;
  textUntilPosition: string;
  tableLookup: Map<string, SqlEditorTable>;
  monaco: MonacoInstance;
  range: Monaco.IRange;
}): Monaco.languages.CompletionItem[] => {
  const aliasMatch = textUntilPosition.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.$/);

  if (!aliasMatch) return [];

  const alias = aliasMatch[1];
  const aliases = extractTableAliases(sql);
  const tableName = aliases[alias];

  if (!tableName) return [];

  const table = tableLookup.get(tableName.toLowerCase());

  if (!table) return [];

  return table.columns.map(column => ({
    label: column.columnName,
    kind: monaco.languages.CompletionItemKind.Field,
    insertText: column.columnName,
    detail: `${alias}.${column.columnName}`,
    documentation: `${column.dataType}${column.nullable ? " nullable" : " not null"}`,
    sortText: `a_${column.position ?? 0}_${column.columnName}`,
    range,
  }));
};

const getContextualColumnSuggestions = ({
  sql,
  textUntilPosition,
  tableLookup,
  monaco,
  range,
}: {
  sql: string;
  textUntilPosition: string;
  tableLookup: Map<string, SqlEditorTable>;
  monaco: MonacoInstance;
  range: Monaco.IRange;
}): Monaco.languages.CompletionItem[] => {
  if (isTableSuggestionContext(textUntilPosition)) return [];

  const selectedTables = extractSelectedTables(sql);

  if (!selectedTables.length) return [];

  const columns: Monaco.languages.CompletionItem[] = [];

  for (const tableName of selectedTables) {
    const table = tableLookup.get(tableName.toLowerCase());

    if (!table) continue;

    for (const column of table.columns) {
      columns.push({
        label: column.columnName,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: column.columnName,
        detail: `${table.tableName}.${column.columnName}`,
        documentation: `${column.dataType}${column.nullable ? " nullable" : " not null"}`,
        sortText: `e_${table.tableName}_${column.position ?? 0}_${column.columnName}`,
        range,
      });
    }
  }

  return columns;
};

function extractTableAliases(sql: string) {
  const aliases: Record<string, string> = {};
  const regex = /\b(?:from|join)\s+("?[\w]+"?(?:\."?[\w]+"?){0,2})\s+(?:as\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql))) {
    const tableName = normalizeTableName(match[1]);
    const alias = normalizeIdentifier(match[2]);

    if (
      alias &&
      tableName &&
      !["where", "join", "left", "right", "inner", "full", "on", "group", "order", "limit"].includes(
        alias.toLowerCase()
      )
    ) {
      aliases[alias] = tableName;
    }
  }

  return aliases;
}

function extractSelectedTables(sql: string) {
  const tableNames: string[] = [];
  const regex = /\b(?:from|join)\s+("?[\w]+"?(?:\."?[\w]+"?){0,2})/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql))) {
    const tableName = normalizeTableName(match[1]);

    if (tableName && !tableNames.includes(tableName)) {
      tableNames.push(tableName);
    }
  }

  return tableNames;
}

function isTableSuggestionContext(textUntilPosition: string) {
  return /\b(from|join)\s+["\w.]*$/i.test(textUntilPosition);
}

function normalizeTableName(value?: string) {
  const cleanValue = String(value || "")
    .replace(/"/g, "")
    .trim();

  if (!cleanValue) return "";

  const parts = cleanValue.split(".").filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }

  return parts[0] ?? "";
}

function normalizeIdentifier(value?: string) {
  return String(value || "")
    .replace(/"/g, "")
    .trim();
}
