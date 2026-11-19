import React,{lazy,Suspense} from 'react';
import {Routes,Route,Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import ProtectedRoute from '../auth/ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';
import {ROLES} from '../config/roles';

// Lazy load pages
const Welcome = lazy(()=>import('../pages/WelcomePage'));
const Login = lazy(()=>import('../pages/Login'));
const Register = lazy(()=>import('../pages/Register'));
const ForgotPassword = lazy(()=>import('../pages/ForgotPassword'));
const Forbidden = lazy(()=>import('../pages/Forbidden'));
const NotFound = lazy(()=>import('../pages/NotFound'));
const SupportPage = lazy(()=>import('../pages/SupportPage'));
const AgencyProfilePage = lazy(()=>import('../pages/AgencyProfilePage'));
const ProfilePage = lazy(()=>import('../pages/ProfilePage'));
const ChangePasswordPage = lazy(()=>import('../pages/ChangePasswordPage'));
const PlaceholderPage = lazy(()=>import('../pages/PlaceholderPage'));

const AIAssistant = lazy(()=>import('../pages/AIAssistant'));

const Dashboard = lazy(()=>import('../operations/Dashboard'));
const ReportsBI = lazy(()=>import('../operations/ReportsBI'));
const Products = lazy(()=>import('../operations/Products'));
const Market = lazy(()=>import('../operations/Market'));
const Ledger = lazy(()=>import('../operations/Ledger'));
const StockOperations = lazy(()=>import('../operations/StockOperations'));
const SalesPos = lazy(()=>import('../components/sales/SalesPos'));
const Management = lazy(()=>import('../operations/Management'));
const AI = lazy(()=>import('../operations/AI'));
const Research = lazy(()=>import('../operations/Research'));
const SettingsPage = lazy(()=>import('../pages/Settings'));
const UserGuide = lazy(()=>import('../operations/UserGuide'));
const BranchesPage = lazy(()=>import('../pages/Branches'));
const AdminDashboard = lazy(()=>import('../pages/admin/AdminDashboard'));
const AdminTickets = lazy(()=>import('../pages/admin/AdminTickets'));
const AdminSystem = lazy(()=>import('../pages/admin/AdminSystem'));
const AdminSecurity = lazy(()=>import('../pages/admin/AdminSecurity'));

// Component bọc Products truyền props bảo mật theo Role
function ProductsRoute(){
  const {user}=useAuth();
  const isCashier = user?.role === ROLES.CASHIER;
  const isInventory = user?.role === ROLES.INVENTORY;
  return (
    <Products
      readOnly={isCashier || isInventory}
      hideCostPrice={isCashier}
    />
  );
}

// Component bọc Sales / Sales History truyền props bảo mật cho CASHIER
function SalesRoute({mode}){
  const {user}=useAuth();
  const isCashier = user?.role === ROLES.CASHIER;
  return (
    <Ledger
      mode={mode}
      sale={true}
      hideCostAndProfit={isCashier}
    />
  );
}

// Component bọc Inventory truyền props bảo mật cho INVENTORY
function InventoryRoute(){
  const {user}=useAuth();
  const isInventory = user?.role === ROLES.INVENTORY;
  return (
    <Ledger
      mode="inventory"
      sale={false}
      hideRevenue={isInventory}
    />
  );
}

export default function App(){
  return (
    <Suspense fallback={
      <div className="op-state" role="status" style={{padding:'40px',textAlign:'center'}}>
        Đang tải giao diện...
      </div>
    }>
      <Routes>
        {/* 1. PUBLIC ROUTES */}
        <Route path="/welcome" element={<Welcome/>}/>
        <Route path="/login" element={<Login/>}/>
        <Route path="/register" element={<Register/>}/>
        <Route path="/forgot-password" element={<ForgotPassword/>}/>
        <Route path="/forbidden" element={<Forbidden/>}/>

        {/* 2. PROTECTED ROUTES TRONG LAYOUT CHUNG */}
        <Route element={<ProtectedRoute/>}>
          <Route element={<AppLayout/>}>
            {/* TỔNG QUAN (OWNER, MANAGER) */}
            <Route index element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <Dashboard/>
              </ProtectedRoute>
            }/>
            <Route path="reports" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <ReportsBI/>
              </ProtectedRoute>
            }/>

            {/* BÁN HÀNG & LỊCH SỬ HÓA ĐƠN (OWNER, MANAGER, CASHIER) */}
            <Route path="sales" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.INVENTORY]}>
                <SalesPos/>
              </ProtectedRoute>
            }/>
            <Route path="sales/pos" element={<Navigate to="/sales" replace />} />
            <Route path="sales/history" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER]}>
                <SalesRoute mode="sales-history"/>
              </ProtectedRoute>
            }/>

            {/* SẢN PHẨM (TẤT CẢ ROLE ĐỀU ĐƯỢC TRA CỨU) */}
            <Route path="products" element={<ProductsRoute/>}/>
            <Route path="products/new" element={<Navigate to="/products" replace />} />

            {/* QUẢN LÝ KHO (OWNER, MANAGER, INVENTORY) */}
            <Route path="inventory" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER, ROLES.INVENTORY]}>
                <InventoryRoute/>
              </ProtectedRoute>
            }/>
            <Route path="receipts" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER, ROLES.INVENTORY]}>
                <Ledger mode="receipts" sale={false}/>
              </ProtectedRoute>
            }/>
            <Route path="stock-operations" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER, ROLES.INVENTORY]}>
                <StockOperations/>
              </ProtectedRoute>
            }/>

            {/* PHÂN TÍCH & AI (OWNER, MANAGER) */}
            <Route path="forecast" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <AI task="sku"/>
              </ProtectedRoute>
            }/>
            <Route path="forecast/total" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <AI task="total"/>
              </ProtectedRoute>
            }/>
            <Route path="forecast/multi" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <AI task="multi"/>
              </ProtectedRoute>
            }/>
            <Route path="alerts" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <AI task="stockout"/>
              </ProtectedRoute>
            }/>
            <Route path="replenishment" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}>
                <AI task="replenishment"/>
              </ProtectedRoute>
            }/>
            {/* HỆ THỐNG (CHỈ OWNER) */}
            <Route path="branches" element={
              <ProtectedRoute allow={[ROLES.OWNER]}>
                <BranchesPage/>
              </ProtectedRoute>
            }/>
            <Route path="users" element={
              <ProtectedRoute allow={[ROLES.OWNER]}>
                <Management mode="staff"/>
              </ProtectedRoute>
            }/>
            <Route path="staff" element={
              <ProtectedRoute allow={[ROLES.OWNER]}>
                <Management mode="staff"/>
              </ProtectedRoute>
            }/>
            <Route path="settings" element={<SettingsPage/>}/>
            {/* HƯỚNG DẪN THAO TÁC (TẤT CẢ ROLE ĐỀU ĐƯỢC DÙNG) */}
            <Route path="guide" element={
              <ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.INVENTORY]}>
                <UserGuide/>
              </ProtectedRoute>
            }/>
            {/* HỒ SƠ CÁ NHÂN & ĐỔI MẬT KHẨU (TẤT CẢ ROLE ĐỀU ĐƯỢC DÙNG) */}
            <Route path="profile" element={<ProfilePage/>}/>
            <Route path="change-password" element={<ChangePasswordPage/>}/>

            {/* HỖ TRỢ (TẤT CẢ ROLE ĐỀU ĐƯỢC DÙNG) */}
            <Route path="support" element={<SupportPage/>}/>
            <Route path="agency-profile" element={<AgencyProfilePage/>}/>

            {/* CÁC PHÂN HỆ MỞ RỘNG */}
            <Route path="market" element={<ProtectedRoute allow={[ROLES.OWNER, ROLES.MANAGER]}><Market/></ProtectedRoute>}/> 
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={[ROLES.PLATFORM_ADMIN]}/> }>
          <Route element={<AppLayout/>}>
            <Route path="admin" element={<AdminDashboard/>}/>
            <Route path="admin/tickets" element={<AdminTickets/>}/>
            <Route path="admin/system" element={<AdminSystem/>}/>
            <Route path="admin/security" element={<AdminSecurity/>}/>
            <Route path="research" element={<Research/>}/>
            <Route path="settings" element={<SettingsPage/>}/>
          </Route>
        </Route>

        {/* 3. CATCH-ALL ROUTE (404) */}
        <Route path="*" element={<NotFound/>}/>
      </Routes>
    </Suspense>
  );
}
