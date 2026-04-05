"use client"

import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Save, Plus, X } from 'lucide-react';

const defaultNodeStyle = { backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' };

const initialNodes: Node[] = [
  { 
    id: '1', 
    position: { x: 250, y: 50 }, 
    data: { label: 'Inicio de Importación' }, 
    type: 'input',
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: defaultNodeStyle
  }
];
const initialEdges: Edge[] = [];

interface CompanyRoadmapProps {
  role?: string | null;
}

export function CompanyRoadmap({ role }: CompanyRoadmapProps) {
  const isAdmin = role === 'admin' || role === 'super_admin';
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Modal State for node editing
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  // Load from DB
  useEffect(() => {
    const fetchRoadmap = async () => {
      try {
        const { data, error } = await supabase
          .from('company_roadmap')
          .select('*')
          .limit(1)
          .single();
          
        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data && data.nodes && data.nodes.length > 0) {
          const styledNodes = data.nodes.map((n: Node) => ({
             ...n,
             sourcePosition: Position.Right,
             targetPosition: Position.Left,
             style: defaultNodeStyle
          }));
          setNodes(styledNodes);
          setEdges(data.edges || []);
        }
      } catch (e) {
        console.error("Error loading roadmap:", e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchRoadmap();
  }, [setNodes, setEdges]);

  // Save to DB
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existingData } = await supabase
        .from('company_roadmap')
        .select('id')
        .limit(1)
        .single();

      if (existingData) {
        await supabase
          .from('company_roadmap')
          .update({ nodes, edges, updated_at: new Date().toISOString() })
          .eq('id', existingData.id);
      } else {
        await supabase
          .from('company_roadmap')
          .insert([{ nodes, edges, title: 'Main Roadmap' }]);
      }
      toast.success("Roadmap guardado correctamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el roadmap");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNode = () => {
    const newNode: Node = {
      id: crypto.randomUUID(),
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { label: 'Nuevo Nodo', description: '' },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: defaultNodeStyle
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const onNodeDoubleClick = (event: React.MouseEvent, node: Node) => {
    if (!isAdmin) return; // Only admins can edit
    setSelectedNode(node);
    setEditLabel(node.data.label as string || "");
    setEditDesc(node.data.description as string || "");
  };

  const handleSaveNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => 
      nds.map(n => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            data: { ...n.data, label: editLabel, description: editDesc }
          };
        }
        return n;
      })
    );
    setSelectedNode(null);
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter(n => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center">Cargando Roadmap...</div>;
  }

  return (
    <div className="w-full h-[80vh] border border-border rounded-xl overflow-hidden relative bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isAdmin ? onNodesChange : undefined}
        onEdgesChange={isAdmin ? onEdgesChange : undefined}
        onConnect={isAdmin ? onConnect : undefined}
        onNodeDoubleClick={onNodeDoubleClick}
        nodesDraggable={isAdmin}
        nodesConnectable={isAdmin}
        elementsSelectable={isAdmin}
        colorMode="system"
        fitView
        className="bg-muted/10 text-foreground"
      >
        <Controls />
        <MiniMap />
        <Background variant={"dots" as any} gap={12} size={1} />
        
        {isAdmin && (
          <Panel position="top-right" className="flex gap-2 p-2">
            <Button onClick={handleAddNode} variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Nodo
            </Button>
            <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Save className="w-4 h-4" /> {isSaving ? "Guardando..." : "Guardar Mapa"}
            </Button>
          </Panel>
        )}
      </ReactFlow>

      {/* Editor Modal */}
      {selectedNode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-background border border-border rounded-lg shadow-xl p-6 w-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Editar Nodo</h3>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground font-medium mb-1 block">Título principal</label>
                <input 
                  type="text" 
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground font-medium mb-1 block">Notas extendidas</label>
                <textarea 
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm min-h-[120px]"
                  placeholder="Instrucciones, consejos operativos o detalles para este paso..."
                />
              </div>
              
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
                <Button variant="destructive" size="sm" onClick={handleDeleteNode}>Borrar Nodo</Button>
                <Button onClick={handleSaveNode} size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">Actualizar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
