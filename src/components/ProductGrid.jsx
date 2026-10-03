const PRODUCTS = [
  {
    name: 'Stoneware mug',
    price: '$24',
    src: '/images/mug.jpg',
    alt: 'Ribbed stoneware mug with a speckled brown glaze on a wooden table',
  },
  {
    name: 'Knit throw blanket',
    price: '$64',
    src: '/images/blanket.jpg',
    alt: 'Stack of folded knit throws in teal, cream, grey, and navy beside a lit candle',
  },
  {
    name: 'Brass table lamp',
    price: '$89',
    src: '/images/lamp.jpg',
    alt: 'Brass table lamp with a white dome shade on a walnut nightstand',
  },
]

export default function ProductGrid() {
  return (
    <section className="products" id="shop" aria-labelledby="products-heading">
      <h2 id="products-heading">New this season</h2>
      <ul className="product-grid">
        {PRODUCTS.map((product) => (
          <li key={product.name} className="product-card">
            <img src={product.src} alt={product.alt} width="800" height="1000" loading="lazy" />
            <div className="product-meta">
              <h3>{product.name}</h3>
              <p>{product.price}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
