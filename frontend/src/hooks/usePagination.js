import {useMemo,useState,useEffect} from 'react';
export function usePagination(rows,perPage=6){const [page,setPage]=useState(1); const pages=Math.max(1,Math.ceil(rows.length/perPage));useEffect(()=>{if(page>pages)setPage(pages)},[pages,page]);const data=useMemo(()=>rows.slice((page-1)*perPage,page*perPage),[rows,page,perPage]);return {page,setPage,pages,data,total:rows.length};}
