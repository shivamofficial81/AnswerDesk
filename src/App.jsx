import SiteHeader from './components/SiteHeader.jsx'
import Hero from './components/Hero.jsx'
import ProductGrid from './components/ProductGrid.jsx'
import SiteFooter from './components/SiteFooter.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import './styles/site.css'
import './styles/chat.css'

function App() {
  return (
    <>
      <p className="fiction-notice">Hearth &amp; Co. is a fictional store created to demonstrate AnswerDesk.</p>
      <SiteHeader />
      <main>
        <Hero />
        <ProductGrid />
      </main>
      <SiteFooter />
      <ChatWidget />
    </>
  )
}

export default App
