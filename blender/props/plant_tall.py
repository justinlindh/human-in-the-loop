'''Tall floor plant: terracotta pot, curved stems, lumpy leaf clusters.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.pot_plant('p_', tall=True), 'plant_tall')
export()
