import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import FarmerDashboard from './pages/farmer/FarmerDashboard';
import MyFarms from './pages/farmer/MyFarms';
import MyBatches from './pages/farmer/MyBatches';
import CreateBatch from './pages/farmer/CreateBatch';
import BatchDetail from './pages/farmer/BatchDetail';
import BuyerDashboard from './pages/buyer/BuyerDashboard';
import BrowseListings from './pages/buyer/BrowseListings';
import BuyerBatchDetail from './pages/buyer/BuyerBatchDetail';
import MyBids from './pages/buyer/MyBids';
import StorageDashboard from './pages/storage/StorageDashboard';
import Warehouses from './pages/storage/Warehouses';
import Allocations from './pages/storage/Allocations';

/** Role wrappers, so each role is stated once per route rather than twice. */
function Farmer({ children }) {
  return <ProtectedRoute roles={['FARMER']}>{children}</ProtectedRoute>;
}

function Buyer({ children }) {
  return <ProtectedRoute roles={['BUYER']}>{children}</ProtectedRoute>;
}

function Storage({ children }) {
  return <ProtectedRoute roles={['STORAGE_MANAGER']}>{children}</ProtectedRoute>;
}

/**
 * Signing in lands you on your role's home. Only FARMER has a real module
 * in Update-1; every other role falls through to the placeholder
 * dashboard, which lists what their module will contain.
 */
function RoleHome() {
  const { user } = useAuth();
  if (user?.role === 'FARMER') return <Navigate to="/farmer" replace />;
  if (user?.role === 'BUYER') return <Navigate to="/buyer" replace />;
  if (user?.role === 'STORAGE_MANAGER') return <Navigate to="/storage" replace />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavBar />
        <main className="app">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <RoleHome />
                </ProtectedRoute>
              }
            />

            <Route path="/farmer" element={<Farmer><FarmerDashboard /></Farmer>} />
            <Route path="/farmer/farms" element={<Farmer><MyFarms /></Farmer>} />
            <Route path="/farmer/batches" element={<Farmer><MyBatches /></Farmer>} />
            <Route path="/farmer/batches/new" element={<Farmer><CreateBatch /></Farmer>} />
            <Route path="/farmer/batches/:batchId" element={<Farmer><BatchDetail /></Farmer>} />

            <Route path="/buyer" element={<Buyer><BuyerDashboard /></Buyer>} />
            <Route path="/buyer/browse" element={<Buyer><BrowseListings /></Buyer>} />
            <Route path="/buyer/bids" element={<Buyer><MyBids /></Buyer>} />
            <Route path="/buyer/batches/:batchId" element={<Buyer><BuyerBatchDetail /></Buyer>} />

            <Route path="/storage" element={<Storage><StorageDashboard /></Storage>} />
            <Route path="/storage/warehouses" element={<Storage><Warehouses /></Storage>} />
            <Route path="/storage/allocations" element={<Storage><Allocations /></Storage>} />

            {/* Still to come: /transport, /admin */}

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
