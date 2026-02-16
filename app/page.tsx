import InlineAuth from "@/app/components/inline-auth";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#fff8dc,_#ffe4b5_35%,_#ffd39a_65%,_#f4ab68)] px-6 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-12 h-[620px] w-[92%] max-w-6xl -translate-x-1/2 rounded-[3rem] bg-white/16 blur-[2px]" />
        <div className="absolute left-[5%] top-20 h-2 w-2 rounded-full bg-yellow-100/80" />
        <div className="absolute right-[8%] top-24 h-3 w-3 rounded-full bg-amber-100/80" />
        <div className="absolute left-[14%] top-64 h-2 w-2 rounded-full bg-white/80" />
        <div className="absolute right-[20%] top-72 h-2 w-2 rounded-full bg-white/75" />
        <div className="absolute left-[18%] top-[430px] h-3 w-3 rounded-full bg-yellow-100/70" />
        <div className="absolute right-[12%] top-[460px] h-2 w-2 rounded-full bg-amber-100/80" />

        <div className="absolute left-[6%] top-16 h-28 w-20 rotate-[-14deg] rounded-md border border-white/55 bg-gradient-to-b from-rose-200/85 to-red-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-10 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-8 w-14 rounded bg-white/30" />
        </div>
        <div className="absolute left-[16%] top-36 h-32 w-[5.5rem] rotate-[9deg] rounded-md border border-white/55 bg-gradient-to-b from-sky-200/85 to-blue-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-12 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-14 rounded bg-white/30" />
        </div>
        <div className="absolute left-[28%] top-14 h-36 w-24 rotate-[-7deg] rounded-md border border-white/55 bg-gradient-to-b from-amber-200/90 to-orange-300/85 shadow-lg">
          <div className="mx-auto mt-3 h-1 w-14 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-10 w-16 rounded bg-white/30" />
        </div>
        <div className="absolute left-[38%] top-44 h-28 w-20 rotate-[11deg] rounded-md border border-white/55 bg-gradient-to-b from-emerald-200/85 to-teal-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-10 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-8 w-12 rounded bg-white/30" />
        </div>
        <div className="absolute left-[49%] top-[4.5rem] h-32 w-[5.5rem] rotate-[-10deg] rounded-md border border-white/55 bg-gradient-to-b from-fuchsia-200/85 to-pink-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-11 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-14 rounded bg-white/30" />
        </div>
        <div className="absolute left-[60%] top-38 h-36 w-24 rotate-[8deg] rounded-md border border-white/55 bg-gradient-to-b from-violet-200/85 to-indigo-300/80 shadow-lg">
          <div className="mx-auto mt-3 h-1 w-14 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-10 w-16 rounded bg-white/30" />
        </div>
        <div className="absolute left-[72%] top-[5.5rem] h-[7.5rem] w-[5.5rem] rotate-[-13deg] rounded-md border border-white/55 bg-gradient-to-b from-lime-200/85 to-green-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-11 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-[3.25rem] rounded bg-white/30" />
        </div>
        <div className="absolute right-[7%] top-44 h-[8.5rem] w-24 rotate-[12deg] rounded-md border border-white/55 bg-gradient-to-b from-cyan-200/85 to-sky-300/80 shadow-lg">
          <div className="mx-auto mt-3 h-1 w-14 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-10 w-16 rounded bg-white/30" />
        </div>

        <div className="absolute left-[9%] top-[330px] h-32 w-[5.5rem] rotate-[8deg] rounded-md border border-white/55 bg-gradient-to-b from-orange-200/85 to-amber-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-11 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-14 rounded bg-white/30" />
        </div>
        <div className="absolute left-[22%] top-[370px] h-28 w-20 rotate-[-9deg] rounded-md border border-white/55 bg-gradient-to-b from-blue-200/85 to-indigo-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-10 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-8 w-12 rounded bg-white/30" />
        </div>
        <div className="absolute left-[34%] top-[320px] h-[8.5rem] w-24 rotate-[10deg] rounded-md border border-white/55 bg-gradient-to-b from-yellow-200/85 to-orange-300/80 shadow-lg">
          <div className="mx-auto mt-3 h-1 w-14 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-16 rounded bg-white/30" />
        </div>
        <div className="absolute left-[46%] top-[390px] h-[7.5rem] w-[5.5rem] rotate-[-7deg] rounded-md border border-white/55 bg-gradient-to-b from-teal-200/85 to-emerald-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-11 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-[3.25rem] rounded bg-white/30" />
        </div>
        <div className="absolute left-[58%] top-[330px] h-36 w-24 rotate-[12deg] rounded-md border border-white/55 bg-gradient-to-b from-rose-200/85 to-pink-300/80 shadow-lg">
          <div className="mx-auto mt-3 h-1 w-14 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-10 w-16 rounded bg-white/30" />
        </div>
        <div className="absolute left-[70%] top-[375px] h-28 w-20 rotate-[-11deg] rounded-md border border-white/55 bg-gradient-to-b from-sky-200/85 to-cyan-300/80 shadow-lg">
          <div className="mx-auto mt-2 h-1 w-10 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-8 w-12 rounded bg-white/30" />
        </div>
        <div className="absolute right-[10%] top-[330px] h-[8.5rem] w-24 rotate-[9deg] rounded-md border border-white/55 bg-gradient-to-b from-purple-200/85 to-violet-300/80 shadow-lg">
          <div className="mx-auto mt-3 h-1 w-14 rounded bg-white/70" />
          <div className="mx-auto mt-2 h-9 w-16 rounded bg-white/30" />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center pt-20">
        <section className="w-full max-w-3xl rounded-[2rem] border border-amber-100/90 bg-white/88 p-8 text-center shadow-[0_25px_70px_-35px_rgba(120,70,30,0.6)] backdrop-blur-sm sm:p-12">
          <p className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Welcome to Story Universe
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-amber-950 sm:text-5xl">
            A great family universe of storytelling awaits.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-amber-900/85 sm:text-lg">
            Create magical bedtime adventures, bring your family characters to
            life, and keep every story in one cozy place.
          </p>
          <InlineAuth />
        </section>

        <section className="mt-10 w-full max-w-5xl rounded-[2rem] border border-amber-200/80 bg-white/80 p-6 shadow-[0_20px_60px_-35px_rgba(120,70,30,0.6)] backdrop-blur-sm sm:p-8">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Start your next adventure
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-amber-100 bg-gradient-to-br from-yellow-50 to-orange-100 p-5">
              <h2 className="text-lg font-semibold text-amber-950">
                The Moonlight Library Train
              </h2>
              <p className="mt-2 text-sm leading-7 text-amber-900/80">
                A magical train visits each child&apos;s room to deliver one secret
                storybook before sunrise.
              </p>
            </article>
            <article className="rounded-2xl border border-amber-100 bg-gradient-to-br from-sky-50 to-blue-100 p-5">
              <h2 className="text-lg font-semibold text-amber-950">
                Captain Comet and the Lost Map
              </h2>
              <p className="mt-2 text-sm leading-7 text-amber-900/80">
                Siblings and grandparents solve starry riddles to find a map to
                a floating island of bedtime dreams.
              </p>
            </article>
            <article className="rounded-2xl border border-amber-100 bg-gradient-to-br from-emerald-50 to-teal-100 p-5">
              <h2 className="text-lg font-semibold text-amber-950">
                The Whispering Treehouse Club
              </h2>
              <p className="mt-2 text-sm leading-7 text-amber-900/80">
                A treehouse full of talking books chooses one brave reader each
                night for a kind and funny quest.
              </p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
