export default function SiteFooter() {
  return (
    <footer className="site-footer" id="contact">
      <div className="footer-grid">
        <div>
          <p className="wordmark">Hearth &amp; Co.</p>
          <p className="muted">Home goods shipped from Portland, Oregon.</p>
        </div>
        <div>
          <h2>Contact</h2>
          <p>
            <a href="mailto:support@hearthandco.example">support@hearthandco.example</a>
          </p>
          <p>
            <a href="tel:+18885550142">1-888-555-0142</a>
          </p>
        </div>
        <div>
          <h2>Support hours</h2>
          <p>Monday to Friday, 8:00 AM to 6:00 PM Pacific Time</p>
        </div>
      </div>
      <p className="copyright">© 2026 Hearth &amp; Co.</p>
    </footer>
  )
}
