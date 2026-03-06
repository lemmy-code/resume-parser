import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import UploadPage from '@/pages/UploadPage'
import SearchPage from '@/pages/SearchPage'
import DetailPage from '@/pages/DetailPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<UploadPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/resumes/:id" element={<DetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
