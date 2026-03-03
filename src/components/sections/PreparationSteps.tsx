import { Snowflake, PackageOpen, MonitorPlay, Utensils, Lightbulb } from "lucide-react";

const steps = [
    {
        number: "01",
        title: "Retire do freezer",
        description: "Tire a marmita do freezer 2 minutos antes de aquecer.",
        icon: Snowflake,
    },
    {
        number: "02",
        title: "Abra a tampa",
        description: "Retire a tampa selada. Não precisa adicionar água.",
        icon: PackageOpen,
    },
    {
        number: "03",
        title: "Micro-ondas",
        description: "Leve ao micro-ondas por 3 a 5 minutos em potência alta.",
        icon: MonitorPlay,
    },
    {
        number: "04",
        title: "Sirva e aproveite",
        description: "Mexa, sirva diretamente na embalagem ou no prato.",
        icon: Utensils,
    },
];

export function PreparationSteps() {
    return (
        <section className="py-16 lg:py-24">
            <div className="container mx-auto px-4">
                <div className="text-center mb-16">
                    <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-3 font-sans">
                        Modo de preparo
                    </p>
                    <h2 className="text-3xl lg:text-4xl text-secondary-foreground mb-4">
                        Pronto em minutos
                    </h2>
                    <p className="text-muted-foreground font-sans text-lg">
                        Sem fogão, sem louça, sem estresse.
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 relative mb-16">
                    {/* Connecting line for lg screens */}
                    <div className="hidden lg:block absolute top-[28px] left-[15%] right-[15%] h-[2px] bg-border border-dashed z-0" />

                    {steps.map((step, index) => (
                        <div key={index} className="flex flex-col items-center text-center relative z-10 group">
                            <div className="w-14 h-14 bg-background border-2 border-border group-hover:border-primary transition-colors rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                                <step.icon className="w-6 h-6 text-secondary-foreground group-hover:text-primary transition-colors" />
                            </div>

                            <div className="text-[5rem] font-bold text-border/40 absolute -top-10 -right-4 z-[-1] select-none font-sans">
                                {step.number}
                            </div>

                            <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2 font-sans">Passo {step.number}</p>
                            <h3 className="text-xl font-semibold text-secondary-foreground mb-3 font-sans">
                                {step.title}
                            </h3>
                            <p className="text-muted-foreground font-sans text-sm leading-relaxed max-w-[200px]">
                                {step.description}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="max-w-2xl mx-auto flex items-center gap-4 bg-secondary/30 p-5 rounded-2xl border border-border/50">
                    <Lightbulb className="w-5 h-5 text-secondary-foreground shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-secondary-foreground font-sans">
                        Dica: Mexa o conteúdo na metade do tempo para aquecer por igual.
                    </p>
                </div>

            </div>
        </section>
    );
}
