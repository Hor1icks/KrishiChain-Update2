import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
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
import FarmerOrders from './pages/farmer/MyOrders';
import FarmerPayments from './pages/farmer/Payments';
import StorageRequests from './pages/farmer/StorageRequests';
import BuyerDashboard from './pages/buyer/BuyerDashboard';
import BrowseListings from './pages/buyer/BrowseListings';
import BuyerBatchDetail from './pages/buyer/BuyerBatchDetail';
import MyBids from './pages/buyer/MyBids';
import BuyerOrders from './pages/buyer/MyOrders';
import BuyerPayments from './pages/buyer/Payments';
import MyStorage from './pages/buyer/MyStorage';
import Reviews from './pages/buyer/Reviews';
import StorageDashboard from './pages/storage/StorageDashboard';
import Warehouses from './pages/storage/Warehouses';
import Allocations from './pages/storage/Allocations';
import Assignments from './pages/transport/Assignments';
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageUsers from './pages/admin/ManageUsers';
import DailyPrices from './pages/admin/DailyPrices';
import Complaints from './pages/admin/Complaints';

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

function Transport({ children }) {
  return <ProtectedRoute roles={['TRANSPORT_PERSONNEL']}>{children}</ProtectedRoute>;
}

function Admin({ children }) {
  return <ProtectedRoute roles={['ADMIN']}>{children}</ProtectedRoute>;
}

/**
 * Signing in lands you on your role's home. Every one of the five roles
 * now has a real module, so the placeholder dashboard is only reachable
 * if a token ever carries a role this build does not know about.
 */
function RoleHome() {
  const { user } = useAuth();
  if (user?.role === 'FARMER') return <Navigate to="/farmer" replace />;
  if (user?.role === 'BUYER') return <Navigate to="/buyer" replace />;
  if (user?.role === 'STORAGE_MANAGER') return <Navigate to="/storage" replace />;
  if (user?.role === 'TRANSPORT_PERSONNEL') return <Navigate to="/transport" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
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
              <Route path="/farmer/orders" element={<Farmer><FarmerOrders /></Farmer>} />
              <Route path="/farmer/payments" element={<Farmer><FarmerPayments /></Farmer>} />
              <Route path="/farmer/storage" element={<Farmer><StorageRequests /></Farmer>} />

              <Route path="/buyer" element={<Buyer><BuyerDashboard /></Buyer>} />
              <Route path="/buyer/browse" element={<Buyer><BrowseListings /></Buyer>} />
              <Route path="/buyer/bids" element={<Buyer><MyBids /></Buyer>} />
              <Route path="/buyer/batches/:batchId" element={<Buyer><BuyerBatchDetail /></Buyer>} />
              <Route path="/buyer/orders" element={<Buyer><BuyerOrders /></Buyer>} />
              <Route path="/buyer/payments" element={<Buyer><BuyerPayments /></Buyer>} />
              <Route path="/buyer/storage" element={<Buyer><MyStorage /></Buyer>} />
              <Route path="/buyer/reviews" element={<Buyer><Reviews /></Buyer>} />

              <Route path="/storage" element={<Storage><StorageDashboard /></Storage>} />
              <Route path="/storage/warehouses" element={<Storage><Warehouses /></Storage>} />
              <Route path="/storage/allocations" element={<Storage><Allocations /></Storage>} />

              <Route path="/transport" element={<Transport><Assignments /></Transport>} />

              <Route path="/admin" element={<Admin><AdminDashboard /></Admin>} />
              <Route path="/admin/users" element={<Admin><ManageUsers /></Admin>} />
              <Route path="/admin/prices" element={<Admin><DailyPrices /></Admin>} />
              <Route path="/admin/complaints" element={<Admin><Complaints /></Admin>} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
