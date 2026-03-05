import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ParadeRecord } from '../types';

export const reportService = {
    generateCommandReturn: (records: ParadeRecord[], title: string = "OFFICIAL PARADE STATE - COMMAND RETURN") => {
        const doc = new jsPDF() as any;

        // Header
        doc.setFontSize(18);
        doc.setTextColor(30, 58, 138); // Blue 900
        doc.text("NIGERIA POLICE ACADEMY", 105, 20, { align: 'center' });

        doc.setFontSize(14);
        doc.text(title, 105, 30, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 38, { align: 'center' });

        // Table Data
        const tableData = records.map(r => [
            r.date,
            r.courseName,
            `Year ${r.yearGroup}`,
            r.presentCount,
            r.absentCount,
            r.sickCount,
            r.detentionCount,
            r.grandTotal
        ]);

        doc.autoTable({
            startY: 45,
            head: [['Date', 'Course', 'Year', 'Pres.', 'Abs.', 'Sick', 'Det.', 'Total']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillStyle: 'fill', fillColor: [30, 58, 138], textColor: 255 },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            styles: { fontSize: 8, cellPadding: 3 }
        });

        // Footer / Sign-off
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text("__________________________", 30, finalY);
        doc.text("COMMANDANT SIGNATURE", 30, finalY + 7);

        doc.text("__________________________", 140, finalY);
        doc.text("ACADEMIC REGISTRAR", 140, finalY + 7);

        doc.save(`Command_Return_${new Date().toISOString().split('T')[0]}.pdf`);
    }
};
