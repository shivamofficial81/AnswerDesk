export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <h1>Everyday pieces for the home, built to last.</h1>
        <p>
          Stoneware, knit throws, and brass, picked for daily use. Orders ship within 1 to 2
          business days, with 30-day returns.
        </p>
        <a className="button-primary" href="#shop">
          Shop the collection
        </a>
      </div>
      <img
        className="hero-image"
        src="/images/blanket.jpg"
        alt="Stack of folded knit throws in teal, cream, grey, and navy beside a lit candle"
        width="1200"
        height="1000"
      />
    </section>
  )
}
