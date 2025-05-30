import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    footerContent,
    size = 'md', // 'sm', 'md', 'lg', 'xl'
    closeOnOverlayClick = true,
}) => {
    useEffect(() => {
        const handleEscapeKey = (event) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isOpen, onClose]);

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl'
    };

    const backdropVariants = {
        visible: { opacity: 1 },
        hidden: { opacity: 0 },
    };

    const modalVariants = {
        hidden: { y: "-50px", opacity: 0 },
        visible: { y: "0", opacity: 1 },
        exit: { y: "50px", opacity: 0 }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="modal-backdrop"
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-75"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={backdropVariants}
                    transition={{ duration: 0.2 }}
                    onClick={closeOnOverlayClick ? onClose : undefined}
                >
                    <motion.div
                        key="modal-content"
                        className={`bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl w-full ${sizeClasses[size]} flex flex-col max-h-[90vh]`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="modal-title"
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={modalVariants}
                        transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.3 }}
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            {title && (
                                <h2 id="modal-title" className="text-lg font-semibold text-text-light dark:text-text-dark">
                                    {title}
                                </h2>
                            )}
                            <button
                                onClick={onClose}
                                className="p-1 rounded-full text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="px-6 py-5 overflow-y-auto flex-grow custom-scrollbar">
                            {children}
                        </div>

                        {/* Modal Footer */}
                        {footerContent && (
                            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                                {footerContent}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default Modal;