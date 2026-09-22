export default function Footer() {
  return (
    <footer className="mt-10 pt-4 border-t border-line text-[12px] text-muted flex flex-wrap gap-x-3 gap-y-1 justify-between">
      <span>
        Created by{' '}
        <a href="https://github.com/payamss" target="_blank" rel="noopener noreferrer" className="hover:text-ink underline decoration-dotted">
          Payam Shariat
        </a>
        {' · '}
        <a href="mailto:payam.shariat@gmail.com" className="hover:text-ink underline decoration-dotted">
          payam.shariat@gmail.com
        </a>
      </span>
      <span>
        <a href="https://github.com/payamss/Claude-Code-Usage" target="_blank" rel="noopener noreferrer" className="hover:text-ink underline decoration-dotted">
          Source &amp; contributing
        </a>
        {' · AGPL-3.0'}
      </span>
    </footer>
  );
}
