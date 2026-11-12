/**
 * Contexte React du site : un seul moteur, partagé par tous les écrans.
 *
 * Le moteur est **injectable** : le site de production reçoit le moteur réel,
 * les tests peuvent en fournir un faux. À chaque événement du moteur, un
 * instantané complet est relu et redescend dans l'arbre — les écrans ne
 * parlent jamais au modèle directement.
 */
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Card, Stack } from "@cardwake/model";
import type { BudgetView, CardwakeEngine, JournalView, Mode, Refusal, SpyView } from "./engine/types";

/** Tout ce qu'un écran peut lire d'un coup, sans effet de bord. */
export type CardwakeSnapshot = {
  engine: CardwakeEngine;
  stack: Stack | null;
  card: Card | null;
  mode: Mode;
  journal: JournalView;
  budget: BudgetView;
  refusal: Refusal | null;
  notice: string | null;
  /** L'espion de messages (CAR-F-19) : la dernière action, décrite. */
  spy: SpyView;
};

/** Relit le moteur : appelé à chaque événement, jamais pendant le rendu. */
export function readSnapshot(engine: CardwakeEngine): CardwakeSnapshot {
  return {
    engine,
    stack: engine.state(),
    card: engine.currentCard(),
    mode: engine.mode(),
    journal: engine.journal(),
    budget: engine.budget(),
    refusal: engine.lastRefusal(),
    notice: engine.lastNotice(),
    spy: engine.spy(),
  };
}

const CardwakeContext = createContext<CardwakeSnapshot | null>(null);

export function CardwakeProvider({
  engine,
  children,
}: {
  engine: CardwakeEngine;
  children: ReactNode;
}): ReactNode {
  const [snapshot, setSnapshot] = useState<CardwakeSnapshot>(() => readSnapshot(engine));

  useEffect(() => {
    // Relecture immédiate : un événement peut être passé entre le rendu et l'effet.
    setSnapshot(readSnapshot(engine));
    return engine.subscribe(() => setSnapshot(readSnapshot(engine)));
  }, [engine]);

  return <CardwakeContext.Provider value={snapshot}>{children}</CardwakeContext.Provider>;
}

/** Le point d'entrée des écrans : l'instantané courant et le moteur. */
export function useCardwake(): CardwakeSnapshot {
  const value = useContext(CardwakeContext);
  if (value === null) throw new Error("useCardwake() must be used inside <CardwakeProvider>.");
  return value;
}
