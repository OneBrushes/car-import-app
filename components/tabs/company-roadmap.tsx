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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save, Plus, Trash2, Loader2 } from 'lucide-react';

// Los tokens del tema son colores directos (hex), no tripletas HSL: usar var() tal cual.
const defaultNodeStyle = { backgroundColor: 'var(--card)', color: 'var(--card-foreground)', borderColor: 'var(--border)' };

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
  }, []);

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

  const header = (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Roadmap de la empresa</h2>
      <p className="text-muted-foreground">
        {isAdmin
          ? "Flujo de trabajo de la importación. Haz doble clic en un nodo para editarlo."
          : "Flujo de trabajo de la importación, paso a paso."}
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in">
        {header}
        <div className="flex h-[60vh] items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando roadmap…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
    {header}
    <div className="relative h-[75vh] w-full overflow-hidden rounded-xl border bg-card shadow-xs">
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
        className="bg-background text-foreground"
      >
        <Controls />
        <MiniMap />
        <Background variant={"dots" as any} gap={12} size={1} />

        {isAdmin && (
          <Panel position="top-right" className="flex gap-2">
            <Button onClick={handleAddNode} variant="outline" size="sm" className="bg-card">
              <Plus className="h-4 w-4" /> Nodo
            </Button>
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Guardando…" : "Guardar mapa"}
            </Button>
          </Panel>
        )}
      </ReactFlow>

      {/* Editor Modal */}
      <Dialog open={!!selectedNode} onOpenChange={(open) => { if (!open) setSelectedNode(null) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Editar nodo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="roadmap-node-label" className="text-[13px]">Título principal</Label>
              <Input
                id="roadmap-node-label"
                type="text"
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="roadmap-node-desc" className="text-[13px]">Notas extendidas</Label>
              <Textarea
                id="roadmap-node-desc"
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="min-h-[120px]"
                placeholder="Instrucciones, consejos operativos o detalles para este paso…"
              />
            </div>
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between border-t pt-4">
            <Button variant="ghost" size="sm" onClick={handleDeleteNode} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Borrar nodo
            </Button>
            <Button onClick={handleSaveNode} size="sm">Actualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
