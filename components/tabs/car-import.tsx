"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Filter, Trash2, Edit, ChevronDown, ChevronUp, Image as ImageIcon, Loader2, LayoutGrid, List } from "lucide-react"
import { AddCarModal } from "@/components/modals/add-car-modal"
import { Button } from "@/components/ui/button"
import { CarCard } from "@/components/cards/car-card"
import { ShareCarModal } from "@/components/modals/share-car-modal"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

interface Car {
  id: string
  user_id?: string
  shared_with?: string[]
  brand: string
  model: string
  year: number
  price: number
  currency: string
  mileage: number
  cv: number
  photo?: string
  image_url?: string
  images?: string[]
  tags: string[]
  origin?: string
  totalExpenses?: number
  url?: string
  itv_link?: string
  steering?: string
  expenses?: any[]
  vehicleType?: string
}

interface CarImportProps {
  role?: string | null
}

export function CarImport({ role }: CarImportProps) {
  const { user } = useAuth()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'gallery'>('grid')
  const [editingCar, setEditingCar] = useState<Car | null>(null)
  // Share State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [carToShare, setCarToShare] = useState<any>(null)

  const handleShareClick = (car: any) => {
    setCarToShare(car)
    setIsShareModalOpen(true)
  }
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState("date")

  // Cargar datos desde Supabase
  useEffect(() => {
    if (user) {
      fetchCars()

      // Subscribe to realtime changes in imported_cars
      const channel = supabase
        .channel('imported_cars_user_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'imported_cars'
          },
          () => {
            // Refetch cars when any change occurs
            fetchCars()
          }
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }
  }, [user])

  const fetchCars = async () => {
    try {
      setLoading(true)

      // Get all cars from database
      const { data, error } = await supabase
        .from('imported_cars')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Filter cars: show only user's cars OR cars shared with user
      const filteredData = data.filter((car: any) =>
        car.user_id === user?.id ||
        (car.shared_with && car.shared_with.includes(user?.id))
      )

      const formattedCars: Car[] = filteredData.map((car: any) => ({
        ...car, // Pasar todos los campos de la BD (snake_case) para que AddCarModal los pueda leer
        id: car.id,
        user_id: car.user_id,
        shared_with: car.shared_with || [],
        brand: car.brand,
        model: car.model,
        year: car.year,
        price: Number(car.price),
        currency: "EUR",
        mileage: Number(car.mileage || 0),
        cv: Number(car.cv || 0),
        photo: car.image_url,
        image_url: car.image_url,
        // Priorizar el array de imágenes real, si no existe, usar image_url
        images: car.images && car.images.length > 0 ? car.images : (car.image_url ? [car.image_url] : []),
        tags: car.tags || [],
        origin: car.origin || "Importado",
        totalExpenses: Number(car.total_cost) - Number(car.price),
        url: car.url || "",
        itv_link: car.itv_link || "",
        steering: car.steering,
        // Asegurar que expenses se pasa
        expenses: car.expenses || []
      }))

      setCars(formattedCars)
    } catch (error) {
      console.error("Error fetching imported cars:", error)
      toast.error("Error al cargar coches importados")
    } finally {
      setLoading(false)
    }
  }

  const addCar = async (newCar: any) => {
    if (!user) return

    try {
      // Datos completos del coche
      const baseCarData = {
        // Básicos
        brand: newCar.brand,
        model: newCar.model,
        year: newCar.year,
        month: newCar.month,
        vehicle_type: newCar.vehicleType,

        // Ubicación y origen
        url: newCar.url || null,
        location: newCar.location || null,
        origin: newCar.origin || null,
        platform: newCar.platform || null,

        // Apariencia
        color: newCar.color || null,
        doors: newCar.doors || null,

        // Especificaciones técnicas
        price: Number(newCar.price),
        mileage: newCar.mileage,
        cv: newCar.cv,
        motor_type: newCar.motorType || null,
        displacement: newCar.displacement || null,
        co2: newCar.co2 || null,
        fuel_type: newCar.fuelType || null,
        transmission: newCar.transmission || null,
        traction: newCar.traction || null,
        steering: newCar.steering,

        // ITV/Inspección
        inspection_name: newCar.inspectionName || null,
        inspection_status: newCar.inspectionStatus || null,
        inspection_expiry: newCar.inspectionExpiry || null,
        itv_link: newCar.itv_link || null,

        // Costes
        transfer_cost: newCar.transferCost ? Number(newCar.transferCost) : null,
        total_cost: Number(newCar.finalPrice) || (Number(newCar.price) + Number(newCar.totalExpenses || 0)),
        expenses: newCar.expenses || null,

        // Desglose de costes (mapeo desde expenses)
        import_tax: newCar.expenses?.find((e: any) => e.type === 'Impuestos Aduana' || e.type === 'IVA' || e.type === 'Aranceles')?.amount || 0,
        shipping_cost: newCar.expenses?.find((e: any) => e.type === 'Transporte' || e.type === 'Grúa')?.amount || 0,
        registration_tax: newCar.expenses?.find((e: any) => e.type === 'Matriculación' || e.type === 'Impuesto Matriculación')?.amount || 0,
        other_costs: newCar.expenses?.reduce((sum: number, e: any) => {
          const mainTypes = ['Impuestos Aduana', 'IVA', 'Aranceles', 'Transporte', 'Grúa', 'Matriculación', 'Impuesto Matriculación'];
          if (!mainTypes.includes(e.type)) {
            return sum + (Number(e.amount) || 0);
          }
          return sum;
        }, 0) || 0,

        // Multimedia y notas
        image_url: newCar.images && newCar.images.length > 0 ? newCar.images[0] : null,
        images: newCar.images || [],
        defects: newCar.defects || null,
        notes: newCar.notes || null,
        tags: newCar.tags || [],
        equipment: newCar.equipment || []
      }

      if (editingCar) {
        // Actualizar (SIN user_id, no se puede cambiar el propietario)
        const { error } = await supabase
          .from('imported_cars')
          .update(baseCarData)
          .eq('id', editingCar.id)

        if (error) throw error
        toast.success("Coche actualizado")

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'UPDATE_CAR',
          details: `Actualizado coche: ${newCar.brand} ${newCar.model}`
        })

        // Notificar a usuarios con quienes está compartido
        if (editingCar.shared_with && editingCar.shared_with.length > 0) {
          // Obtener datos del propietario
          const { data: ownerData } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', user.id)
            .single()

          const ownerName = ownerData?.first_name && ownerData?.last_name
            ? `${ownerData.first_name} ${ownerData.last_name}`
            : ownerData?.email || 'Alguien'

          // Crear notificación para cada usuario compartido
          const notifications = editingCar.shared_with.map((userId: string) => ({
            user_id: userId,
            type: 'car_updated',
            title: 'Coche compartido modificado',
            message: `El coche compartido por ${ownerName} ha sido modificado`,
            link: '/car-import',
            metadata: {
              car_id: editingCar.id,
              car_name: `${newCar.brand} ${newCar.model} (${newCar.year})`,
              updated_by: user.id,
              owner_name: ownerName
            }
          }))

          await supabase.from('notifications').insert(notifications)
        }
      } else {
        // Crear (CON user_id)
        const { error } = await supabase
          .from('imported_cars')
          .insert({
            ...baseCarData,
            user_id: user.id // Solo al crear
          })

        if (error) throw error
        toast.success("Coche añadido")

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'ADD_CAR',
          details: `Añadido coche: ${newCar.brand} ${newCar.model} (${newCar.year})`
        })
      }

      setIsModalOpen(false)
      setEditingCar(null)
      fetchCars()
    } catch (error: any) {
      toast.error("Error al guardar coche: " + error.message)
    }
  }

  const deleteCar = async (id: string) => {
    // Eliminado confirmación nativa a petición del usuario
    try {
      const carToDelete = cars.find(c => c.id === id)
      const { error } = await supabase
        .from('imported_cars')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success("Coche eliminado correctamente")

      if (user && carToDelete) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'DELETE_CAR',
          details: `Eliminado coche: ${carToDelete.brand} ${carToDelete.model}`
        })
      }

      fetchCars()
    } catch (error) {
      toast.error("Error al eliminar coche")
    }
  }

  const handleEdit = (car: Car) => {
    setEditingCar(car)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCar(null)
  }

  // Filtrar y buscar
  const filteredCars = cars.filter((car) => {
    return (
      car.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      car.model.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  // Ordenar
  const sortedCars = [...filteredCars].sort((a, b) => {
    switch (sortBy) {
      case "price":
        return a.price - b.price
      case "mileage":
        return a.mileage - b.mileage
      default:
        return 0
    }
  })

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Importación de Coches</h2>
          <p className="text-muted-foreground">Gestiona y calcula costes de importación</p>
        </div>
        {role !== 'usuario' && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Añadir Coche
          </Button>
        )}
      </div>

      {/* Búsqueda y Filtros */}
      <div className="flex flex-col gap-4 bg-card border border-border rounded-lg p-4">
        <input
          type="text"
          placeholder="Buscar por marca o modelo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <div className="flex gap-2 items-center">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="date">Más reciente</option>
            <option value="price">Precio menor</option>
            <option value="mileage">Menor km</option>
          </select>

          <div className="flex bg-muted rounded-lg p-1 ml-auto gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Vista Cuadrícula"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Vista Tabla"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('gallery')}
              className={`p-2 rounded-md transition-all ${viewMode === 'gallery' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Vista Galería"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Coches */}
      {sortedCars.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No hay coches registrados aún</p>
          <button onClick={() => setIsModalOpen(true)} className="text-primary hover:underline font-medium">
            Añade tu primer coche
          </button>
        </div>
      ) : (
        <>
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedCars.map((car) => (
                <CarCard
                  key={car.id}
                  car={car}
                  onDelete={() => deleteCar(car.id)}
                  onEdit={() => handleEdit(car)}
                  onShare={() => handleShareClick(car)}
                  currentUserId={user?.id}
                />
              ))}
            </div>
          )}

          {viewMode === 'table' && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                    <tr>
                      <th className="p-4">Coche</th>
                      <th className="p-4">Precio</th>
                      <th className="p-4">Km</th>
                      <th className="p-4">Año</th>
                      <th className="p-4">Ubicación</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedCars.map(car => (
                      <tr key={car.id} className="hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-md bg-muted overflow-hidden relative flex-shrink-0">
                              {car.image_url ? (
                                <img src={car.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <ImageIcon className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{car.brand} {car.model}</div>
                              <div className="text-xs text-muted-foreground">{car.vehicleType}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-medium">{car.price.toLocaleString()} {car.currency}</td>
                        <td className="p-4">{car.mileage.toLocaleString()} km</td>
                        <td className="p-4">{car.year}</td>
                        <td className="p-4 text-muted-foreground">{car.origin || "-"}</td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(car)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCar(car.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === 'gallery' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {sortedCars.map(car => (
                <div key={car.id} className="group relative aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all" onClick={() => handleEdit(car)}>
                  {car.image_url ? (
                    <img src={car.image_url} alt={car.model} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted">
                      <ImageIcon className="w-10 h-10 opacity-50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <p className="text-white font-bold truncate text-sm">{car.brand} {car.model}</p>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-white/90 text-xs font-medium">{car.price.toLocaleString()} {car.currency}</p>
                      <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">{car.year}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <AddCarModal
        key={editingCar ? editingCar.id : `new-${Date.now()}`}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingCar(null)
        }}
        onSubmit={addCar}
        initialData={editingCar}
      />

      {carToShare && (
        <ShareCarModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false)
            setCarToShare(null)
          }}
          carId={carToShare.id}
          currentSharedWith={carToShare.shared_with || []}
          onShare={fetchCars}
        />
      )}
    </div>
  )
}
