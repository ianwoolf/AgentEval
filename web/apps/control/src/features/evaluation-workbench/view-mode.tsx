import {createContext,useContext} from 'react';
export const AdminViewContext=createContext(true);
export const useAdminView=()=>useContext(AdminViewContext);
