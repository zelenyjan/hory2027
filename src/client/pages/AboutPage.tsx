import { Link } from 'react-router-dom';

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Shot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="my-4">
      <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface-2 shadow-sm">
        <img
          src={src}
          alt={alt}
          className="block w-full"
          loading="lazy"
          decoding="async"
        />
      </div>
      <figcaption className="mt-2 text-center text-xs text-ink-soft">{caption}</figcaption>
    </figure>
  );
}

export function AboutPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-lg px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="pt-4">
          <span
            aria-hidden
            className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand to-brand-2 text-3xl shadow-lg shadow-brand/30"
          >
            ❄️
          </span>
          <h1 className="gradient-text text-3xl font-bold tracking-tight">Hory 2027</h1>
          <p className="mt-2 text-ink-soft">
            Soukromá appka na plánování lyžařského výletu — chat, hlasování a seznam ubytování na
            jednom místě.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/login" className="btn-primary px-4 py-2.5 text-sm">
              Přihlásit se
            </Link>
            <a href="#prihlaseni" className="btn-ghost px-4 py-2.5 text-sm">
              Přihlášení a heslo
            </a>
            <a href="#instalace" className="btn-ghost px-4 py-2.5 text-sm">
              Instalace do telefonu
            </a>
          </div>
        </header>

        <Section id="prihlaseni" title="Jak se dostanu dovnitř?">
          <p>
            Appka je jen pro pozvané. Máš dvě cesty: osobní odkaz od Greena, nebo (až si nastavíš
            heslo) klasické přihlášení jménem a heslem.
          </p>

          <h3 className="pt-2 text-base font-semibold text-ink">1) Pozvánkový odkaz</h3>
          <ol className="space-y-2">
            <Step n={1}>
              Green ti pošle odkaz — vypadá jako{' '}
              <code className="rounded bg-brand-soft px-1.5 py-0.5 text-brand">
                hory2027.baby/join/…
              </code>
              .
            </Step>
            <Step n={2}>Otevři ho v prohlížeči (na iPhonu ideálně Safari).</Step>
            <Step n={3}>Appka tě rovnou pustí dovnitř — bez vyplňování hesla.</Step>
          </ol>
          <Shot
            src="/about/02-invite-link.png"
            alt="Správa — vygenerovaný pozvánkový odkaz"
            caption="Takto vypadá pozvánka ve Správě — Green ti ji pošle (odkaz funguje opakovaně)."
          />
          <p>
            Stejný odkaz můžeš použít znovu na jiném telefonu nebo po odhlášení. Když odkaz ztratíš,
            Green ti vygeneruje nový (starý pak přestane fungovat).
          </p>

          <h3 className="pt-2 text-base font-semibold text-ink">2) Přihlášení jménem a heslem</h3>
          <p>
            Funguje až poté, co si v profilu heslo nastavíš. Pak otevři{' '}
            <Link to="/login" className="text-brand underline-offset-2 hover:underline">
              /login
            </Link>
            , vyplň jméno a heslo a potvrď „Přihlásit se“.
          </p>
          <Shot
            src="/about/01-login.png"
            alt="Přihlašovací obrazovka Hory 2027"
            caption="Skutečná obrazovka /login — jméno + heslo."
          />
          <p>
            Pozvánkový odkaz po nastavení hesla pořád funguje, pokud ho Green (nebo ty) nevypne.
          </p>
        </Section>

        <Section id="heslo" title="Nastavení a změna hesla">
          <p>
            Heslo je volitelné. Hodí se, když nechceš pokaždé hledat pozvánku, nebo když se
            přihlašuješ z počítače.
          </p>

          <h3 className="pt-2 text-base font-semibold text-ink">První nastavení</h3>
          <ol className="space-y-2">
            <Step n={1}>V appce klepni na svůj avatar vpravo nahoře — otevře se profil.</Step>
            <Step n={2}>V sekci „Nastavit heslo“ zadej nové heslo (alespoň 4 znaky).</Step>
            <Step n={3}>Potvrď „Uložit heslo“. Pozvánka ti dál funguje.</Step>
          </ol>
          <Shot
            src="/about/03-set-password.png"
            alt="Profil — první nastavení hesla"
            caption="Profil (avatar nahoře) → Nastavit heslo."
          />

          <h3 className="pt-2 text-base font-semibold text-ink">Změna hesla</h3>
          <ol className="space-y-2">
            <Step n={1}>Znovu otevři profil (avatar nahoře).</Step>
            <Step n={2}>
              V sekci „Změnit heslo“ vyplň současné heslo a nové heslo, pak „Uložit heslo“.
            </Step>
            <Step n={3}>
              Uvidíš potvrzení „Heslo uloženo.“ Od té chvíle platí jen nové heslo na /login.
            </Step>
          </ol>
          <Shot
            src="/about/04-change-password.png"
            alt="Profil — změna hesla"
            caption="Profil → Změnit heslo (současné + nové heslo)."
          />
          <p>
            Heslo zapomeneš? Použij pozvánkový odkaz (pokud ho máš), nebo napiš Greenovi — vygeneruje
            nový odkaz. Staré heslo z odkazu neobnovíš bez Greena.
          </p>
        </Section>

        <Section title="Co v appce najdeš">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="font-medium text-ink">Chat</strong> — skupinová konverzace, reakce,
              odpovědi, @zmínky a přečtení zpráv (fajfky).
            </li>
            <li>
              <strong className="font-medium text-ink">Hlasování</strong> — ankety mimo chat. Hlasy
              jsou v partě vidět se jmény.
            </li>
            <li>
              <strong className="font-medium text-ink">Místa</strong> — seznam ubytování s cenou v
              Kč, palci nahoru/dolů a komentáři u každého místa.
            </li>
            <li>
              <strong className="font-medium text-ink">Odkazy</strong> — důležité weby a soubory
              (ski pass, mapky, rezervace), které si parta připne se společným názvem.
            </li>
          </ul>
          <p>Vpravo nahoře je tvůj profil: téma (Sníh / Noc), hesla a oznámení.</p>
        </Section>

        <Section title="Jak používat Chat">
          <p>Napiš zprávu dole a potvrď Odeslat. Dlouhým stiskem (nebo klepnutím) na zprávu otevřeš:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>reakce (👍 ❤️ …),</li>
            <li>odpověď na konkrétní zprávu,</li>
            <li>úpravu nebo smazání vlastní zprávy,</li>
            <li>u svých zpráv seznam, kdo už je přečetl,</li>
            <li>
              zmínku napsáním <code className="text-ink">@</code> a výběrem jména ze seznamu.
            </li>
          </ul>
          <p>
            Klasické smajlíky jako <code className="text-ink">:)</code>,{' '}
            <code className="text-ink">:D</code> nebo <code className="text-ink">&lt;3</code> se při
            odeslání samy změní na emoji.
          </p>
        </Section>

        <Section title="Jak používat Hlasování">
          <p>
            V záložce Hlasování založíš anketu s otázkou a 2–10 možnostmi. Můžeš zvolit jednu nebo
            více odpovědí. Hlasy jde měnit, dokud někdo anketu neuzavře. Výsledky jsou hned vidět —
            včetně toho, kdo co zvolil.
          </p>
        </Section>

        <Section title="Jak používat Místa">
          <p>
            Přidej ubytování tlačítkem „Přidat místo“: odkaz (Booking, Airbnb, …), celkovou cenu v
            Kč, lokalitu a volitelně vlastní název a poznámku. Název, popis a fotku zkusíme načíst
            z odkazu automaticky (Booking a Airbnb to často blokují).
          </p>
          <p>
            U každého místa dej palec nahoru nebo dolů, filtruj podle lokality a seřaď podle skóre,
            ceny nebo data. Tlačítko Detail otevře stránku místa — uvidíš kdo hlasoval a jak, plus
            diskuzi (v komentářích můžeš stejně jako v chatu označit lidi přes @).
          </p>
        </Section>

        <Section id="instalace" title="Instalace do telefonu">
          <p className="font-medium text-ink">iPhone (Safari)</p>
          <ol className="mt-2 space-y-2">
            <Step n={1}>Otevři appku v Safari (ne v Chrome ani v Instagramu / Messengeru).</Step>
            <Step n={2}>
              Dole klepni na Sdílet <span aria-hidden>□↑</span>.
            </Step>
            <Step n={3}>Zvol „Přidat na plochu“ a potvrď.</Step>
            <Step n={4}>Spouštěj Hory ikonou z plochy — ne záložkou v Safari.</Step>
          </ol>

          <p className="mt-6 font-medium text-ink">Android (Chrome)</p>
          <ol className="mt-2 space-y-2">
            <Step n={1}>Otevři appku v Chrome.</Step>
            <Step n={2}>Menu ⋮ → „Instalovat aplikaci“ nebo „Přidat na plochu“.</Step>
            <Step n={3}>Potvrď instalaci a otevírej Hory z ikony na ploše.</Step>
          </ol>
        </Section>

        <Section title="Zapnutí oznámení">
          <p>
            Oznámení ti přijdou na nové zprávy v chatu, nové ankety / hlasy a nová ubytování — i když
            appku zrovna nemáš otevřenou. Na ikoně se taky ukáže počet nepřečtených zpráv.
          </p>
          <ol className="space-y-2">
            <Step n={1}>
              Na iPhonu nejdřív nainstaluj appku na plochu a otevři ji z ikony (jinak oznámení
              nefungují).
            </Step>
            <Step n={2}>V appce klepni na svůj avatar vpravo nahoře.</Step>
            <Step n={3}>V sekci Oznámení zvol „Zapnout oznámení“ a povol je v systémovém dialogu.</Step>
            <Step n={4}>
              Zaškrtni, co chceš dostávat (zprávy, zmínky, hlasy, místa, odkazy) — nebo „Jen zmínky“.
            </Step>
            <Step n={5}>Volitelně pošli „Zkušební oznámení“, ať víš, že to funguje.</Step>
          </ol>
          <p>
            Když jsi oznámení jednou zakázal: v Nastavení telefonu → Oznámení → Hory zapni „Povolit
            oznámení“. Na počítači klikni na ikonu zámku u adresy → Oznámení → Povolit.
          </p>
        </Section>

        <Section title="Soukromí">
          <p>
            Nic z appky není veřejné. Bez přihlášení (nebo platného invite odkazu) neuvidíš chat,
            hlasování ani místa. Tahle stránka O aplikaci je jediná veřejná.
          </p>
        </Section>

        <p className="mt-12 text-center text-sm text-ink-soft">
          Otázky? Napiš Greenovi.
          <br />
          <Link to="/login" className="mt-3 inline-block text-brand underline-offset-2 hover:underline">
            Přejít na přihlášení
          </Link>
        </p>
      </div>
    </div>
  );
}
