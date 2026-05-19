import React from 'react';
import ThroughputChart from '../components/ThroughputChart';
import QualityHeatmap from '../components/QualityHeatmap';
import LabelingGuidelinesPDF from '../components/LabelingGuidelinesPDF';
import AnnotationRulesEditor from '../components/AnnotationRulesEditor';

export default function CustomViewsPage() {
  return (
    <div style={{padding:20, maxWidth:1200, margin:'0 auto'}}>
      <div style={{marginBottom:16}}>
        <h1 style={{margin:'0 0 4px'}}>Labeling Views</h1>
        <div style={{color:'#666'}}>
          Custom views for the AI Data Labeling Platform: throughput, quality, dataset spec, and rules.
        </div>
      </div>

      <section>
        <h2 style={{borderBottom:'1px solid #e5e7eb', paddingBottom:6}}>Visualizations</h2>
        <ThroughputChart />
        <QualityHeatmap />
      </section>

      <section>
        <h2 style={{borderBottom:'1px solid #e5e7eb', paddingBottom:6}}>Documentation & Schema</h2>
        <LabelingGuidelinesPDF />
        <AnnotationRulesEditor />
      </section>
    </div>
  );
}
