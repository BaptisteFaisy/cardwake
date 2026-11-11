/**
 * Arbre syntaxique de Murmur — le contrat commun de tout le projet.
 *
 * Ce fichier est la seule définition de la forme d'un script analysé :
 * l'analyseur le produit, l'imprimeur le re-transforme en texte, la relecture
 * en clair le traduit en phrases, l'interpréteur l'exécute, les contrôles
 * statiques le parcourent. Toute évolution de la grammaire passe d'abord ici,
 * puis dans `docs/language.md` (la référence partagée par les deux IA).
 *
 * Règles du langage rappelées (cahier des charges 7.3) : tout est du texte ;
 * un texte qui a la forme d'un nombre sert de nombre ; les mots-clés sont
 * insensibles à la casse ; une instruction par ligne ; commentaires après `--`.
 */

/** Position dans le texte source, pour les erreurs et l'éditeur. */
export type Pos = {
  /** Ligne, 1-based. */
  line: number;
  /** Colonne, 1-based. */
  col: number;
  /** Décalage en caractères depuis le début du texte, 0-based. */
  offset: number;
};

/** Empan dans le texte source. Toujours présent : aucune erreur sans position. */
export type Span = { start: Pos; end: Pos };

// --------------------------------------------------------------------------
// Désignations d'objets
// --------------------------------------------------------------------------

/** Type de morceau de texte : la marque de fabrique de la famille. */
export type ChunkType = "char" | "word" | "item" | "line";

/** Comment un objet est désigné : par son nom, son rang ou son identifiant. */
export type RefBy =
  | { kind: "name"; name: string; span: Span }
  | { kind: "index"; index: Expr; span: Span }
  | { kind: "id"; id: Expr; span: Span };

/** Référence à une carte. */
export type CardRef =
  | { kind: "this" | "next" | "previous" | "first" | "last"; span: Span }
  | { kind: "card"; by: RefBy; span: Span };

/** Référence à un élément (bouton ou champ), éventuellement d'une autre carte. */
export type PartRef = {
  partKind: "field" | "button";
  by: RefBy;
  /** Absent = la carte en cours. */
  of?: CardRef;
  span: Span;
};

/** Référence à l'agent d'une carte (`agent`, `agent of card "Cook"`). */
export type AgentRef = { of?: CardRef; span: Span };

/**
 * Toute désignation d'objet utilisable comme cible d'une commande
 * (`set … of`, `send … to`, `show`, `hide`, `delete`).
 */
export type ObjRef =
  | { kind: "me"; span: Span }
  | { kind: "target"; span: Span }
  | { kind: "card"; ref: CardRef; span: Span }
  | { kind: "part"; ref: PartRef; span: Span }
  | { kind: "agent"; ref: AgentRef; span: Span }
  | { kind: "thisBackground"; span: Span }
  | { kind: "thisStack"; span: Span };

// --------------------------------------------------------------------------
// Expressions
// --------------------------------------------------------------------------

export type BinOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "^"
  | "div"
  | "mod"
  | "&"
  | "&&"
  | "="
  | "<>"
  | "<"
  | ">"
  | "<="
  | ">="
  | "and"
  | "or"
  | "contains"
  | "isIn";

/** Fonctions intégrées du langage. Aucune ne touche au réseau ni aux fichiers. */
export type BuiltinFn =
  | "length"
  | "offset"
  | "round"
  | "min"
  | "max"
  | "sum"
  | "average"
  | "upper"
  | "lower"
  | "random";

/** Propriétés lisibles via `the <prop> of <obj>`. */
export type PropName =
  | "name"
  | "visible"
  | "enabled"
  | "locked"
  | "hilite"
  | "label"
  | "style"
  | "rect"
  | "text";

/** Compteurs accessibles via `the number of <chunktype|cards> …`. */
export type CountSubject = ChunkType | "cards";

export type Expr =
  | { kind: "str"; value: string; span: Span }
  | { kind: "num"; value: number; text: string; span: Span }
  | { kind: "var"; name: string; span: Span }
  | { kind: "it"; span: Span }
  | { kind: "empty"; span: Span }
  | { kind: "bin"; op: BinOp; left: Expr; right: Expr; span: Span }
  | { kind: "not"; operand: Expr; span: Span }
  | { kind: "neg"; operand: Expr; span: Span }
  | { kind: "paren"; inner: Expr; span: Span }
  | { kind: "fn"; fn: BuiltinFn; args: Expr[]; span: Span }
  | { kind: "call"; name: string; args: Expr[]; span: Span }
  | { kind: "count"; subject: CountSubject; of?: Expr | ObjRef; span: Span }
  | { kind: "prop"; prop: PropName; of: ObjRef; span: Span }
  | { kind: "theDate" | "theTime" | "theLongDate"; span: Span }
  /** `field "X"` lu comme valeur : le texte du champ. */
  | { kind: "objText"; ref: ObjRef; span: Span }
  /** `word 2 of field "X"` lu comme valeur. */
  | { kind: "chunk"; chunk: Chunk; of: Container; span: Span };

// --------------------------------------------------------------------------
// Conteneurs et morceaux
// --------------------------------------------------------------------------

/**
 * Morceau désigné : ordinal (`word 2`), plage (`line 3 to 5`) ou borne
 * ouverte (`item 2 to -1`). Les bornes sont des expressions.
 */
export type Chunk = {
  type: ChunkType;
  /** `word 2` : une seule borne, ordinal. */
  ordinal?: Expr;
  /** `word 2 to 4` : plage. */
  from?: Expr;
  to?: Expr;
  span: Span;
};

/**
 * Cible d'une écriture. Trois formes : une variable locale/globale, `it`,
 * ou un objet (champ, propriété) éventuellement réduit à un morceau.
 */
export type Container =
  | { kind: "var"; name: string; span: Span }
  | { kind: "it"; span: Span }
  | { kind: "obj"; ref: ObjRef; chunk?: Chunk; prop?: PropName; span: Span };

// --------------------------------------------------------------------------
// Instructions
// --------------------------------------------------------------------------

export type ArithOp = "add" | "subtract" | "multiply" | "divide";

export type CreateWhat =
  | { kind: "card"; name?: Expr; background?: Expr; span: Span }
  | { kind: "background"; name?: Expr; span: Span }
  | { kind: "part"; partKind: "field" | "button"; name?: Expr; span: Span };

export type SortSpec = {
  container: Container;
  by?: { kind: ChunkType; index?: Expr };
  descending: boolean;
  numeric: boolean;
  span: Span;
};

export type RepeatLoop =
  | { kind: "with"; name: string; from: Expr; to: Expr; step?: Expr }
  | { kind: "forEach"; chunkType: ChunkType; name: string; in: Expr }
  | { kind: "while"; cond: Expr }
  | { kind: "times"; count: Expr };

export type Stmt =
  | { kind: "put"; expr: Expr; mode: "into" | "before" | "after"; target: Container; span: Span }
  | { kind: "set"; prop: PropName; obj: ObjRef; value: Expr; span: Span }
  | { kind: "get"; expr: Expr; span: Span }
  | { kind: "go"; card: CardRef; span: Span }
  | { kind: "send"; message: Expr; args: Expr[]; to: ObjRef; span: Span }
  | { kind: "pass"; message?: string; span: Span }
  | { kind: "answer"; expr: Expr; span: Span }
  | { kind: "ask"; prompt: Expr; into?: Container; span: Span }
  | { kind: "show" | "hide"; obj: ObjRef; span: Span }
  | { kind: "arith"; op: ArithOp; value: Expr; target: Container; span: Span }
  | { kind: "create"; what: CreateWhat; span: Span }
  | { kind: "delete"; obj: ObjRef; span: Span }
  | { kind: "sort"; spec: SortSpec; span: Span }
  | { kind: "find"; expr: Expr; span: Span }
  | { kind: "wait"; duration: Expr; unit: "ms" | "seconds"; span: Span }
  | { kind: "consult"; agent: AgentRef; with: Expr; span: Span }
  | { kind: "tell"; agent: AgentRef; text: Expr; span: Span }
  | { kind: "if"; cond: Expr; then: Stmt[]; otherwise?: Stmt[]; span: Span }
  | { kind: "repeat"; loop: RepeatLoop; body: Stmt[]; span: Span }
  | { kind: "exit"; what: "repeat" | { handler: string }; span: Span }
  | { kind: "return"; value?: Expr; span: Span }
  | { kind: "global"; names: string[]; span: Span }
  | { kind: "call"; name: string; args: Expr[]; span: Span };

// --------------------------------------------------------------------------
// Script
// --------------------------------------------------------------------------

export type Handler = {
  name: string;
  params: string[];
  body: Stmt[];
  span: Span;
};

export type FunctionDef = {
  name: string;
  params: string[];
  body: Stmt[];
  span: Span;
};

export type Script = {
  handlers: Handler[];
  functions: FunctionDef[];
};

/** Résultat d'une analyse : soit un arbre, soit des erreurs, jamais les deux. */
export type ParseOk = { ok: true; script: Script };
export type ParseErr = { ok: false; errors: ScriptError[] };
export type ParseResult = ParseOk | ParseErr;

export type ErrorCategory =
  | "syntax"
  | "reference"
  | "type"
  | "limit"
  | "permission"
  | "runtime"
  | "halted";

/**
 * Erreur de script. Toujours lisible : objet, ligne, colonne, catégorie,
 * message en langage simple et piste. Jamais de trace technique du navigateur
 * (cahier des charges 7.3, CAR-F-15).
 */
export type ScriptError = {
  category: ErrorCategory;
  message: string;
  /** Piste de correction, pour l'auteur. */
  hint?: string;
  /** Objet concerné, quand il est identifiable. */
  object?: string;
  line?: number;
  col?: number;
  span?: Span;
};
