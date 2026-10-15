"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Link } from "react-router";
import PageHeader from "@/components/layout/PageHeader";
import { ArrowRight02Icon, CheckListIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cards } from "./constants";

export default function QCConfigurationPage() {
  return (
    <>
      <PageHeader title="QC Configuration" description="Choose how you want to configure your data quality checks" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        {cards.map((card, i) => (
          <Link to={card.route} key={card.title} className="block">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -5 }}
              className="h-full group">
              <Card
                className={cn(
                  "qc-animated-border relative overflow-hidden h-full p-7 rounded-2xl cursor-pointer transition-all",
                  "bg-card",
                  "shadow-[var(--shadow-soft)]",
                  "hover:shadow-[var(--shadow-panel)]"
                )}>
                <div
                  className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full opacity-20 blur-3xl"
                  style={{ backgroundColor: card.color }}
                />

                <div className="relative flex h-full flex-col justify-between gap-8">
                  <div className="space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className="size-14 rounded-2xl flex items-center justify-center ring-1"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${card.color} 10%, var(--background))`,
                          color: card.color,
                          borderColor: `color-mix(in oklab, ${card.color} 22%, transparent)`,
                        }}>
                        <HugeiconsIcon icon={card.icon} size={24} />
                      </div>

                      <div
                        className="rounded-full px-3 py-1 text-[11px] font-medium ring-1"
                        style={{
                          color: card.color,
                          backgroundColor: `color-mix(in oklab, ${card.color} 8%, transparent)`,
                          borderColor: `color-mix(in oklab, ${card.color} 18%, transparent)`,
                        }}>
                        {card.statsValue}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-lg font-semibold text-foreground">{card.title}</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {card.meta.map(item => (
                        <div
                          key={item}
                          className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          <HugeiconsIcon icon={CheckListIcon} size={15} style={{ color: card.color }} />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.statsLabel}</p>
                      <p className="text-sm font-medium text-foreground">{card.statsValue}</p>
                    </div>

                    <div
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition group-hover:translate-x-0.5"
                      style={{
                        color: card.color,
                        backgroundColor: `color-mix(in oklab, ${card.color} 8%, transparent)`,
                      }}>
                      Configure
                      <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </Link>
        ))}
      </div>
    </>
  );
}
