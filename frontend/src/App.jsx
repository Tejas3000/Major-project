import { Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Lend from './pages/Lend';
import Borrow from './pages/Borrow';
import Portfolio from './pages/Portfolio';
import Markets from './pages/Markets';
import Predictions from './pages/Predictions';

function App() {
    return (
        <WalletProvider>
            <Layout>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/lend" element={<Lend />} />
                    <Route path="/borrow" element={<Borrow />} />
                    <Route path="/portfolio" element={<Portfolio />} />
                    <Route path="/markets" element={<Markets />} />
                    <Route path="/predictions" element={<Predictions />} />
                </Routes>
            </Layout>
        </WalletProvider>
    );
}

export default App;
