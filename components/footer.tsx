import Image from "next/image";

export function Footer() {
  return (
    <footer className="mt-auto flex flex-col items-center justify-center gap-4 border-t border-[rgba(0,0,0,0.06)] py-8">
      <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[#00150d]/50">
        <a
          className="flex items-center gap-2 transition-colors hover:text-[#00150d]"
          href="https://github.com/Crossmint/agentic-checkout-quickstart"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/file.svg" alt="File icon" width={14} height={14} />
          View code
        </a>
        <a
          className="flex items-center gap-2 transition-colors hover:text-[#00150d]"
          href="https://www.crossmint.com/quickstarts"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/window.svg" alt="Window icon" width={14} height={14} />
          See all quickstarts
        </a>
        <a
          className="flex items-center gap-2 transition-colors hover:text-[#00150d]"
          href="https://crossmint.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/globe.svg" alt="Globe icon" width={14} height={14} />
          Go to crossmint.com →
        </a>
      </div>
      <Image
        src="/crossmint-leaf.svg"
        alt="Powered by Crossmint"
        priority
        width={120}
        height={79}
      />
    </footer>
  );
}
