import React from "react";

const StarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7.99992 11.4533L11.5266 13.56L10.5933 9.53331L13.7333 6.84665L9.61992 6.50665L7.99992 2.66665L6.37992 6.50665L2.26659 6.84665L5.40659 9.53331L4.47326 13.56L7.99992 11.4533Z" fill="currentColor" />
  </svg>
);

const PercentIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4.66667 8C5.40305 8 6 7.40305 6 6.66667C6 5.93029 5.40305 5.33333 4.66667 5.33333C3.93029 5.33333 3.33333 5.93029 3.33333 6.66667C3.33333 7.40305 3.93029 8 4.66667 8ZM11.3333 10.6667C12.0697 10.6667 12.6667 10.0697 12.6667 9.33333C12.6667 8.59695 12.0697 8 11.3333 8C10.597 8 10 8.59695 10 9.33333C10 10.0697 10.597 10.6667 11.3333 10.6667ZM12.6667 4L3.33333 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TruckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M11.3333 11.3333V4.66667C11.3333 4.31304 11.1929 3.97391 10.9428 3.72386C10.6928 3.47381 10.3536 3.33333 10 3.33333H2C1.64638 3.33333 1.30724 3.47381 1.05719 3.72386C0.807142 3.97391 0.666667 4.31304 0.666667 4.66667V11.3333M0.666667 11.3333H1.33333M0.666667 11.3333C0.666667 11.687 0.807142 12.0261 1.05719 12.2761C1.30724 12.5262 1.64638 12.6667 2 12.6667H2.66667M11.3333 11.3333H10M11.3333 11.3333C11.3333 11.687 11.1929 12.0261 10.9428 12.2761C10.6928 12.5262 10.3536 12.6667 10 12.6667H8.66667M14 6L11.3333 3.33333V11.3333H12M14 6V11.3333C14 11.687 13.8595 12.0261 13.6095 12.2761C13.3594 12.5262 13.0203 12.6667 12.6667 12.6667C12.313 12.6667 11.9739 12.5262 11.7239 12.2761C11.4738 12.0261 11.3333 11.687 11.3333 11.3333H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12.6667C4.73638 12.6667 5.33333 12.0697 5.33333 11.3333C5.33333 10.597 4.73638 10 4 10C3.26362 10 2.66667 10.597 2.66667 11.3333C2.66667 12.0697 3.26362 12.6667 4 12.6667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8.66667 11.3333H5.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChefHatIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4 14V11.3333M12 14V11.3333M2.66667 14H13.3333C13.6647 14 13.8304 14 13.9152 13.9353C14 13.8706 14 13.7386 14 13.4745V11.8588C14 11.5948 14 11.4627 13.9152 11.398C13.8304 11.3333 13.6647 11.3333 13.3333 11.3333H2.66667C2.33528 11.3333 2.16959 11.3333 2.08479 11.398C2 11.4627 2 11.5948 2 11.8588V13.4745C2 13.7386 2 13.8706 2.08479 13.9353C2.16959 14 2.33528 14 2.66667 14ZM4.66667 11.3333V4.66667C4.66667 3.78261 4.66667 3.34058 4.83918 2.99024C5.00488 2.6537 5.25304 2.40554 5.58958 2.23984C5.93992 2.06733 6.38195 2.06733 7.26601 2.06733H8.73399C9.61805 2.06733 10.0601 2.06733 10.4104 2.23984C10.747 2.40554 10.9951 2.6537 11.1608 2.99024C11.3333 3.34058 11.3333 3.78261 11.3333 4.66667V11.3333H4.66667ZM6.66667 11.3333V2.06733M9.33333 11.3333V2.06733" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const benefits = [
  { icon: StarIcon, label: "4,7 de 5", sub: "Avaliação dos clientes" },
  { icon: PercentIcon, label: "5% OFF no PIX", sub: "Em todos os pedidos" },
  { icon: TruckIcon, label: "Entrega em 48h", sub: "Gelado e selado" },
  { icon: ChefHatIcon, label: "Feito artesanalmente", sub: "Sem conservantes" },
];

const BenefitsBar = () => {
  return (
    <section className="bg-white border-b border-border">
      <div className="container mx-auto px-4 py-5">
        <div className="flex flex-col md:flex-row items-center justify-center md:divide-x divide-border gap-y-4 md:gap-y-0">
          {benefits.map((b, index) => (
            <div key={b.label} className={`flex items-center gap-3 w-full md:w-auto ${index !== 0 ? 'md:pl-6 lg:pl-8' : ''} ${index !== benefits.length - 1 ? 'md:pr-6 lg:pr-8' : ''}`}>
              <div className="w-[36px] h-[36px] rounded-full bg-[#1e3a1e] flex items-center justify-center flex-shrink-0 text-white">
                <b.icon />
              </div>
              <div className="flex flex-col justify-center">
                <p className="font-bold text-[#1a1a1a] text-[14px] leading-tight font-sans">
                  {b.label}
                </p>
                <p className="text-[12px] text-[#6b6b6b] leading-tight font-sans">
                  {b.sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BenefitsBar;
