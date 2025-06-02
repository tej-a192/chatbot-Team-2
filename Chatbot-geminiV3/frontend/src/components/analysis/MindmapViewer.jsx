// frontend/src/components/analysis/MindmapViewer.jsx
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import toast from 'react-hot-toast';

const MindmapViewer = forwardRef(({ markdownContent }, ref) => {
    const localSvgRef = useRef(null);
    const toolbarContainerRef = useRef(null); // Ref for the toolbar's container div
    const [markmapInstance, setMarkmapInstance] = useState(null);
    const [toolbarInstance, setToolbarInstance] = useState(null);
    const { Transformer, Markmap, Toolbar } = window.markmap;

    useImperativeHandle(ref, () => ({
        getSvgElement: () => localSvgRef.current,
        getMarkmapInstance: () => markmapInstance,
    }));

    useEffect(() => {
        if (!markdownContent || !localSvgRef.current || !toolbarContainerRef.current || !Transformer || !Markmap || !Toolbar) {
            if (localSvgRef.current) localSvgRef.current.innerHTML = '';
            if (toolbarContainerRef.current) toolbarContainerRef.current.innerHTML = ''; // Clear toolbar too
            return;
        }
        
        let mm, tb;
        try {
            if (markmapInstance && typeof markmapInstance.destroy === 'function') {
                markmapInstance.destroy();
            }
            if (toolbarInstance && toolbarInstance.el && toolbarInstance.el.parentNode) {
                toolbarInstance.el.parentNode.removeChild(toolbarInstance.el);
            }
            if (toolbarContainerRef.current) {
                toolbarContainerRef.current.innerHTML = '';
            }


            const transformer = new Transformer();
            const { root } = transformer.transform(markdownContent); 
            
            localSvgRef.current.innerHTML = ''; 
            mm = Markmap.create(localSvgRef.current, null, root);
            setMarkmapInstance(mm);

            tb = Toolbar.create(mm);
            toolbarContainerRef.current.appendChild(tb.el);
            setToolbarInstance(tb);
            
            setTimeout(() => mm.fit(), 150); 

        } catch (e) {
            console.error("Error rendering Markmap:", e);
            toast.error("Failed to render mind map. Check console for details.");
            if (localSvgRef.current) localSvgRef.current.innerHTML = '<p class="text-xs text-red-500 p-2">Error rendering mind map. Invalid Markdown or Markmap library issue.</p>';
        }
        
        return () => {
            if (mm && typeof mm.destroy === 'function') {
                mm.destroy();
            }
            if (tb && tb.el && tb.el.parentNode) {
                tb.el.parentNode.removeChild(tb.el);
            }
        };
    }, [markdownContent]); 
    if (!markdownContent) {
        return <p className="text-xs text-text-muted-light dark:text-text-muted-dark p-2">No mind map data to display.</p>;
    }

    return (
        <div className="markmap-container relative w-full min-h-[20rem] md:min-h-[24rem] my-2 flex flex-col">
            {/* Container for the toolbar */}
            <div ref={toolbarContainerRef} className="markmap-toolbar-container h-8 mb-1"></div>
            {/* SVG for the mindmap */}
            <div className="flex-grow w-full h-full"> {/* Ensure SVG container takes remaining space */}
                <svg ref={localSvgRef} className="w-full h-full border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 shadow-inner"></svg>
            </div>
        </div>
    );
});

export default MindmapViewer;