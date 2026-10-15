// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Add01Icon, Calendar03Icon, Mail01Icon } from '@hugeicons/core-free-icons';
// import { HugeiconsIcon } from '@hugeicons/react';
// import React, { useState } from 'react'
// import type { Frequency } from './ScheduledReports';
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
// import { cn } from '@/lib/utils';

// function ScheduleReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
//   const [frequency, setFrequency] = useState<Frequency>("Current Batch");
//   const [selected, setSelected] = useState<Exclude<Workstream, "All Workstreams">[]>(["Marketing"]);
//   const [email, setEmail] = useState("");
//   const [emails, setEmails] = useState<string[]>(["sales-qc-dl@company.com"]);

//   const toggle = (item: Exclude<Workstream, "All Workstreams">) => {
//     setSelected(prev => (prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]));
//   };

//   const addEmail = () => {
//     const value = email.trim();
//     if (!value || emails.includes(value)) return;
//     setEmails(prev => [...prev, value]);
//     setEmail("");
//   };

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogContent
//         className={cn(
//           "w-[min(960px,calc(100vw-32px))] sm:max-w-none",
//           "overflow-hidden rounded-3xl border-border/50 bg-card p-0 shadow-2xl"
//         )}>
//         <DialogHeader className="border-b border-border/50 bg-gradient-to-r from-primary/8 via-card to-card p-6">
//           <div className="flex items-start gap-3">
//             <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
//               <HugeiconsIcon icon={Calendar03Icon} size={22} />
//             </div>

//             <div>
//               <DialogTitle className="text-xl font-semibold text-foreground">Schedule Report</DialogTitle>
//               <p className="mt-1 text-sm text-muted-foreground">
//                 Configure automated batch summary reports for your business teams
//               </p>
//             </div>
//           </div>
//         </DialogHeader>

//         <div className="space-y-5 p-6">
//           <Field label="Schedule Name" required>
//             <Input placeholder="e.g., Weekly Sales Summary" className="h-11 rounded-2xl bg-background" />
//           </Field>

//           <Field label="Frequency" required>
//             <SegmentedControl value={frequency} onChange={setFrequency} items={frequencies} />
//           </Field>

//           <Field label="Impacted Workstreams" required hint="Select workstreams to include in the report">
//             <div className="flex flex-wrap gap-2">
//               {workstreams
//                 .filter((item): item is Exclude<Workstream, "All Workstreams"> => item !== "All Workstreams")
//                 .map(item => {
//                   const active = selected.includes(item);

//                   return (
//                     <button
//                       key={item}
//                       onClick={() => toggle(item)}
//                       className={cn(
//                         "rounded-full px-4 py-2 text-sm font-semibold transition",
//                         active
//                           ? "bg-primary/10 text-primary ring-1 ring-primary/30"
//                           : "bg-background text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
//                       )}>
//                       {item}
//                     </button>
//                   );
//                 })}
//             </div>
//           </Field>

//           <Field
//             label="Email / DL Address"
//             required
//             hint="Add multiple email addresses or distribution lists for delivery">
//             <div className="flex gap-2">
//               <div className="relative flex-1">
//                 <HugeiconsIcon
//                   icon={Mail01Icon}
//                   size={17}
//                   className="absolute left-3 top-1/2 -translate-y-1/2 text-primary"
//                 />
//                 <Input
//                   value={email}
//                   onChange={e => setEmail(e.target.value)}
//                   onKeyDown={e => {
//                     if (e.key === "Enter") {
//                       e.preventDefault();
//                       addEmail();
//                     }
//                   }}
//                   placeholder="Enter email or DL address"
//                   className="h-11 rounded-2xl bg-background pl-10"
//                 />
//               </div>

//               <Button
//                 type="button"
//                 onClick={addEmail}
//                 className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
//                 <HugeiconsIcon icon={Add01Icon} size={16} />
//                 Add
//               </Button>
//             </div>

//             {emails.length > 0 && (
//               <div className="mt-3 flex flex-wrap gap-2">
//                 {emails.map(item => (
//                   <button
//                     key={item}
//                     onClick={() => setEmails(prev => prev.filter(emailItem => emailItem !== item))}
//                     className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-destructive/10 hover:text-destructive">
//                     {item}
//                   </button>
//                 ))}
//               </div>
//             )}
//           </Field>
//         </div>

//         <div className="flex justify-end gap-3 border-t border-border/50 bg-muted/20 p-6">
//           <Button variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
//             Cancel
//           </Button>
//           <Button className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
//             Create Schedule
//           </Button>
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }

// export default ScheduleReportDialog

// function SegmentedControl<T extends string>({
//   value,
//   onChange,
//   items,
// }: {
//   value: T;
//   onChange: (value: T) => void;
//   items: readonly T[];
// }) {
//   return (
//     <div className="flex w-full rounded-2xl bg-muted/50 p-1 ring-1 ring-border/50 md:w-auto">
//       {items.map(item => {
//         const active = item === value;

//         return (
//           <button
//             key={item}
//             type="button"
//             onClick={() => onChange(item)}
//             className={cn(
//               "h-9 min-w-32 flex-1 rounded-xl px-4 text-sm font-semibold transition md:flex-none",
//               active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
//             )}>
//             {item}
//           </button>
//         );
//       })}
//     </div>
//   );
// }

// function Field({
//   label,
//   required,
//   hint,
//   children,
// }: {
//   label: string;
//   required?: boolean;
//   hint?: string;
//   children: React.ReactNode;
// }) {
//   return (
//     <div className="space-y-2">
//       <label className="text-sm font-semibold text-foreground">
//         {label} {required && <span className="text-destructive">*</span>}
//       </label>
//       {children}
//       {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
//     </div>
//   );
// }