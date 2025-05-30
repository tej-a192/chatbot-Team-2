import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

// Ensure Markmap libraries are loaded globally from index.html (d3, markmap-lib, markmap-view, markmap-toolbar)

function MindmapViewer({ markdownContent }) {
    const svgRef = useRef(null);
    const [markmapInstance, setMarkmapInstance] = useState(null);
    const [toolbarInstance, setToolbarInstance] = useState(null);
    const { Transformer, Markmap, Toolbar } = window.markmap; // Access global markmap

    useEffect(() => {
        if (!markdownContent || !svgRef.current || !Transformer || !Markmap || !Toolbar) {
            if (svgRef.current) svgRef.current.innerHTML = ''; // Clear previous
            return;
        }
        
        let mm, tb;
        try {
            // Cleanup previous instances if they exist
            if (markmapInstance && typeof markmapInstance.destroy === 'function') {
                markmapInstance.destroy();
            }
            if (toolbarInstance && toolbarInstance.el && toolbarInstance.el.parentNode) {
                toolbarInstance.el.parentNode.removeChild(toolbarInstance.el);
            }

            const transformer = new Transformer();
            const { root, features } = transformer.transform(markdownContent);
            
            svgRef.current.innerHTML = ''; // Clear before re-rendering
            mm = Markmap.create(svgRef.current, null, root); // Create new Markmap
            setMarkmapInstance(mm);

            // Create and prepend toolbar
            tb = Toolbar.create(mm);
            svgRef.current.parentNode.insertBefore(tb.el, svgRef.current);
            setToolbarInstance(tb);
            
            // Auto-fit after a short delay to ensure rendering is complete
            setTimeout(() => mm.fit(), 100);

        } catch (e) {
            console.error("Error rendering Markmap:", e);
            toast.error("Failed to render mind map. Check console for details.");
            if (svgRef.current) svgRef.current.innerHTML = '<p class="text-xs text-red-500 p-2">Error rendering mind map. Invalid Markdown for mind map?</p>';
        }
        
        // Cleanup function for when component unmounts or markdownContent changes
        return () => {
            if (mm && typeof mm.destroy === 'function') {
                mm.destroy();
            }
            if (tb && tb.el && tb.el.parentNode) {
                tb.el.parentNode.removeChild(tb.el);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [markdownContent]); // Rerun when markdownContent changes

    if (!markdownContent) {
        return <p className="text-xs text-text-muted-light dark:text-text-muted-dark p-2">No mind map data to display.</p>;
    }

    return (
        <div className="relative w-full h-80 md:h-96 my-2">
            {/* Toolbar will be prepended here by useEffect */}
            <svg ref={svgRef} className="w-full h-full border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-inner"></svg>
        </div>
    );
}

export default MindmapViewer;