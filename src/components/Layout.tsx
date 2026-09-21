import { Outlet, Link, useLocation } from 'react-router-dom';
import { MdDashboard, MdAccountBalanceWallet, MdCreditCard, MdAnalytics, MdSettings, MdLogout } from 'react-icons/md';
import { auth } from '../db/firebase';
import { signOut } from 'firebase/auth';
const Layout = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: <MdDashboard /> },
    { path: '/pemasukan', label: 'Pemasukan', icon: <MdAccountBalanceWallet /> },
    { path: '/pengeluaran', label: 'Pengeluaran', icon: <MdCreditCard /> },
    { path: '/cicilan', label: 'Cicilan', icon: <MdCreditCard /> },
    { path: '/analisa', label: 'Analisa', icon: <MdAnalytics /> },
    { path: '/pengaturan', label: 'Pengaturan', icon: <MdSettings /> },
  ];

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          CashFlow
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              to={item.path} 
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); signOut(auth); }} 
            className="nav-item text-danger"
            style={{marginTop: 'auto'}}
          >
            <MdLogout />
            <span>Logout</span>
          </a>
        </nav>
        
        <div className="sidebar-promo">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin: '0 auto'}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <p>Take control of your money</p>
          <Link to="/pengaturan" className="btn btn-primary" style={{width: '100%'}}>Plan your budget</Link>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
